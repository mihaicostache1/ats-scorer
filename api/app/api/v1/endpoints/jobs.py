"""Job API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_recruiter_or_admin, get_current_user, get_tenant_db
from app.models.job import Job
from app.models.pipeline_stage import PipelineStage
from app.models.user import User
from app.schemas.application import PipelineStageResponse
from app.schemas.job import (
    CreateJobRequest,
    JobResponse,
    JobSortField,
    JobStatus,
    PaginatedJobsResponse,
    SortOrder,
    UpdateJobRequest,
    UpdateJobStatusRequest,
)
from app.schemas.pagination import PaginationMeta
from app.services.audit_service import log_audit_event
from app.services.pipeline_service import get_job_stages

router = APIRouter(prefix="/jobs", tags=["Jobs"])

_SORT_COLUMNS = {
    JobSortField.CREATED_AT: Job.created_at,
    JobSortField.UPDATED_AT: Job.updated_at,
    JobSortField.TITLE: Job.title,
    JobSortField.STATUS: Job.status,
}


def _get_job_or_404(db: Session, job_id: uuid.UUID) -> Job:
    """Load a job through the tenant-scoped session; other orgs' jobs look missing."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job with ID '{job_id}' was not found.",
        )
    return job


def _set_status(
    db: Session, job: Job, new_status: JobStatus, action: str, user: User, request: Request
) -> Job:
    """Apply a status change and audit it; a no-op change writes nothing."""
    if job.status == new_status:
        return job

    previous = job.status
    job.status = new_status.value
    log_audit_event(
        db=db,
        org_id=job.org_id,
        action=action,
        target_entity="job",
        target_id=job.id,
        user_id=user.id,
        details={"from": previous, "to": new_status.value},
        request=request,
    )
    db.commit()
    db.refresh(job)
    return job


@router.get(
    "",
    response_model=PaginatedJobsResponse,
    summary="List job postings for the current organization",
)
def list_jobs(
    status_filter: JobStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, max_length=255),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sort_by: JobSortField = Query(JobSortField.CREATED_AT),
    sort_order: SortOrder = Query(SortOrder.DESC),
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> PaginatedJobsResponse:
    """Return a paginated list of jobs. Archived jobs are only listed with ``status=archived``."""
    query = db.query(Job)

    if status_filter is not None:
        query = query.filter(Job.status == status_filter.value)
    else:
        query = query.filter(Job.status != JobStatus.ARCHIVED.value)

    term = search.strip() if search else ""
    if term:
        query = query.filter(
            or_(
                Job.title.icontains(term, autoescape=True),
                Job.department.icontains(term, autoescape=True),
                Job.location.icontains(term, autoescape=True),
            )
        )

    total = query.count()

    column = _SORT_COLUMNS[sort_by]
    ordering = column.asc() if sort_order == SortOrder.ASC else column.desc()
    # Job.id breaks ties so pages stay stable when the sort column has duplicates.
    items = query.order_by(ordering, Job.id).offset((page - 1) * per_page).limit(per_page).all()

    return PaginatedJobsResponse(
        items=[JobResponse.model_validate(item) for item in items],
        pagination=PaginationMeta.build(page=page, per_page=per_page, total_items=total),
    )


@router.post(
    "",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a job posting",
)
def create_job(
    payload: CreateJobRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Job:
    """Create a draft job in the current organization. Admin or recruiter only."""
    job = Job(
        id=uuid.uuid4(),
        org_id=current_user.org_id,
        status=JobStatus.DRAFT.value,
        created_by=current_user.id,
        **payload.model_dump(),
    )
    db.add(job)
    log_audit_event(
        db=db,
        org_id=job.org_id,
        action="create_job",
        target_entity="job",
        target_id=job.id,
        user_id=current_user.id,
        details={"title": job.title},
        request=request,
    )
    db.commit()
    db.refresh(job)
    return job


@router.get(
    "/{id}",
    response_model=JobResponse,
    summary="Get a job posting",
)
def get_job(
    id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> Job:
    """Return a single job from the current organization."""
    return _get_job_or_404(db, id)


@router.patch(
    "/{id}",
    response_model=JobResponse,
    summary="Update a job posting",
)
def update_job(
    id: uuid.UUID,
    payload: UpdateJobRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Job:
    """Partially update a job. Admin or recruiter only."""
    job = _get_job_or_404(db, id)

    changes = {
        field: value
        for field, value in payload.model_dump(exclude_unset=True).items()
        if getattr(job, field) != value
    }
    if not changes:
        return job

    for field, value in changes.items():
        setattr(job, field, value)
    log_audit_event(
        db=db,
        org_id=job.org_id,
        action="update_job",
        target_entity="job",
        target_id=job.id,
        user_id=current_user.id,
        details={"changed_fields": sorted(changes)},
        request=request,
    )
    db.commit()
    db.refresh(job)
    return job


@router.get(
    "/{id}/stages",
    response_model=list[PipelineStageResponse],
    summary="Get a job's pipeline stages in order",
)
def get_job_stages_endpoint(
    id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> list[PipelineStage]:
    """Return the job's own stages, or the organization defaults when it has none."""
    return get_job_stages(db, _get_job_or_404(db, id))


@router.patch(
    "/{id}/status",
    response_model=JobResponse,
    summary="Change a job posting's status (draft, open, closed)",
)
def update_job_status(
    id: uuid.UUID,
    payload: UpdateJobStatusRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Job:
    """Move a job to draft, open or closed. Admin or recruiter only."""
    job = _get_job_or_404(db, id)
    return _set_status(db, job, payload.status, "change_job_status", current_user, request)


@router.post(
    "/{id}/archive",
    response_model=JobResponse,
    summary="Archive a job posting",
)
def archive_job(
    id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Job:
    """Archive a job, hiding it from the default list. Admin or recruiter only."""
    job = _get_job_or_404(db, id)
    return _set_status(db, job, JobStatus.ARCHIVED, "archive_job", current_user, request)
