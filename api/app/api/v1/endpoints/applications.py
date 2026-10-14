"""Application API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_recruiter_or_admin, get_current_user, get_tenant_db
from app.models.application import Application
from app.models.application_stage_history import ApplicationStageHistory
from app.models.candidate import Candidate
from app.models.job import Job
from app.models.user import User
from app.schemas.application import (
    ApplicationResponse,
    ApplicationStatus,
    CreateApplicationRequest,
    PaginatedApplicationsResponse,
    StageHistoryResponse,
    UpdateStageRequest,
)
from app.schemas.job import JobStatus
from app.schemas.pagination import PaginationMeta
from app.services.audit_service import log_audit_event
from app.services.pipeline_service import get_job_stages

router = APIRouter(prefix="/applications", tags=["Applications"])

_STATUS_BY_STAGE_TYPE = {
    "hired": ApplicationStatus.HIRED.value,
    "rejected": ApplicationStatus.REJECTED.value,
}


def _not_found(entity: str, entity_id: uuid.UUID) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{entity} with ID '{entity_id}' was not found.",
    )


def _get_application_or_404(
    db: Session, application_id: uuid.UUID, for_update: bool = False
) -> Application:
    """Load an application through the tenant-scoped session; other orgs' look missing."""
    query = db.query(Application).filter(Application.id == application_id)
    if for_update:
        query = query.with_for_update()
    application = query.first()
    if application is None:
        raise _not_found("Application", application_id)
    return application


@router.get(
    "",
    response_model=PaginatedApplicationsResponse,
    summary="List applications for the current organization",
)
def list_applications(
    job_id: uuid.UUID | None = Query(None),
    candidate_id: uuid.UUID | None = Query(None),
    stage_id: uuid.UUID | None = Query(None),
    status_filter: ApplicationStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> PaginatedApplicationsResponse:
    """Return a paginated list of applications, newest first."""
    query = db.query(Application)

    if job_id is not None:
        query = query.filter(Application.job_id == job_id)
    if candidate_id is not None:
        query = query.filter(Application.candidate_id == candidate_id)
    if stage_id is not None:
        query = query.filter(Application.stage_id == stage_id)
    if status_filter is not None:
        query = query.filter(Application.status == status_filter.value)

    total = query.count()
    items = (
        query.order_by(Application.applied_at.desc(), Application.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return PaginatedApplicationsResponse(
        items=[ApplicationResponse.model_validate(item) for item in items],
        pagination=PaginationMeta.build(page=page, per_page=per_page, total_items=total),
    )


@router.post(
    "",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a candidate to a job",
)
def create_application(
    payload: CreateApplicationRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Application:
    """Link a candidate to a job, starting in the first stage. Admin or recruiter only."""
    # Both lookups are tenant-scoped, so a job or candidate of another org looks missing.
    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if job is None:
        raise _not_found("Job", payload.job_id)
    candidate = db.query(Candidate).filter(Candidate.id == payload.candidate_id).first()
    if candidate is None:
        raise _not_found("Candidate", payload.candidate_id)

    if job.status in (JobStatus.CLOSED.value, JobStatus.ARCHIVED.value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job is {job.status} and does not accept new applications.",
        )

    stages = get_job_stages(db, job)
    if not stages:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No pipeline stages are configured for this job.",
        )
    first_stage = next((s for s in stages if s.stage_type == "applied"), stages[0])

    application = Application(
        id=uuid.uuid4(),
        org_id=current_user.org_id,
        job_id=job.id,
        candidate_id=candidate.id,
        stage_id=first_stage.id,
        status=ApplicationStatus.ACTIVE.value,
    )
    application.stage_history.append(
        ApplicationStageHistory(
            org_id=application.org_id,
            from_stage_id=None,
            to_stage_id=first_stage.id,
            moved_by=current_user.id,
        )
    )
    db.add(application)
    log_audit_event(
        db=db,
        org_id=application.org_id,
        action="create_application",
        target_entity="application",
        target_id=application.id,
        user_id=current_user.id,
        details={
            "job_id": str(job.id),
            "candidate_id": str(candidate.id),
            "stage_id": str(first_stage.id),
        },
        request=request,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This candidate already has an application for this job.",
        ) from None
    db.refresh(application)
    return application


@router.get(
    "/{id}",
    response_model=ApplicationResponse,
    summary="Get an application",
)
def get_application(
    id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> Application:
    """Return a single application from the current organization."""
    return _get_application_or_404(db, id)


@router.get(
    "/{id}/history",
    response_model=list[StageHistoryResponse],
    summary="Get an application's stage history",
)
def get_application_history(
    id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> list[ApplicationStageHistory]:
    """Return every stage the application entered, oldest first."""
    application = _get_application_or_404(db, id)
    return (
        db.query(ApplicationStageHistory)
        .filter(ApplicationStageHistory.application_id == application.id)
        .order_by(ApplicationStageHistory.moved_at, ApplicationStageHistory.id)
        .all()
    )


@router.patch(
    "/{id}/stage",
    response_model=ApplicationResponse,
    summary="Move an application to another pipeline stage",
)
def move_application_stage(
    id: uuid.UUID,
    payload: UpdateStageRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Application:
    """Move an application within its job's pipeline. Admin or recruiter only.

    Moving to the stage the application is already in changes nothing.
    """
    # Locked so concurrent moves record a consistent from/to chain.
    application = _get_application_or_404(db, id, for_update=True)

    stages = {stage.id: stage for stage in get_job_stages(db, application.job)}
    target = stages.get(payload.stage_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline stage with ID '{payload.stage_id}' was not found for this job.",
        )
    if target.id == application.stage_id:
        return application

    previous = application.stage
    application.stage = target
    application.status = _STATUS_BY_STAGE_TYPE.get(
        target.stage_type, ApplicationStatus.ACTIVE.value
    )
    application.rejection_reason = payload.reason if target.stage_type == "rejected" else None
    application.stage_history.append(
        ApplicationStageHistory(
            org_id=application.org_id,
            from_stage_id=previous.id,
            to_stage_id=target.id,
            reason=payload.reason,
            moved_by=current_user.id,
        )
    )
    # The free-text reason stays out of the audit log, which outlives a deleted
    # candidate; it is kept in the stage history instead.
    log_audit_event(
        db=db,
        org_id=application.org_id,
        action="move_application_stage",
        target_entity="application",
        target_id=application.id,
        user_id=current_user.id,
        details={
            "job_id": str(application.job_id),
            "from_stage_id": str(previous.id),
            "to_stage_id": str(target.id),
            "from": previous.name,
            "to": target.name,
            "has_reason": payload.reason is not None,
        },
        request=request,
    )
    db.commit()
    db.refresh(application)
    return application
