"""Candidate API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import (
    get_current_admin,
    get_current_recruiter_or_admin,
    get_current_user,
    get_tenant_db,
)
from app.core.logging import logger
from app.models.candidate import Candidate
from app.models.user import User
from app.schemas.candidate import (
    CandidateResponse,
    CandidateSortField,
    CreateCandidateRequest,
    PaginatedCandidatesResponse,
    UpdateCandidateRequest,
)
from app.schemas.job import SortOrder
from app.schemas.pagination import PaginationMeta
from app.services.audit_service import log_audit_event
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/candidates", tags=["Candidates"])

_SORT_COLUMNS = {
    CandidateSortField.CREATED_AT: Candidate.created_at,
    CandidateSortField.UPDATED_AT: Candidate.updated_at,
    CandidateSortField.FULL_NAME: Candidate.full_name,
    CandidateSortField.EMAIL: Candidate.email,
}

_DUPLICATE_EMAIL = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="A candidate with this email already exists.",
)


def _get_candidate_or_404(db: Session, candidate_id: uuid.UUID) -> Candidate:
    """Load a candidate through the tenant-scoped session; other orgs' candidates look missing."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate with ID '{candidate_id}' was not found.",
        )
    return candidate


@router.get(
    "",
    response_model=PaginatedCandidatesResponse,
    summary="List candidates for the current organization",
)
def list_candidates(
    search: str | None = Query(None, max_length=255),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sort_by: CandidateSortField = Query(CandidateSortField.CREATED_AT),
    sort_order: SortOrder = Query(SortOrder.DESC),
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> PaginatedCandidatesResponse:
    """Return a paginated list of candidates, optionally filtered by name or email."""
    query = db.query(Candidate)

    term = search.strip() if search else ""
    if term:
        query = query.filter(
            or_(
                Candidate.full_name.icontains(term, autoescape=True),
                Candidate.email.icontains(term, autoescape=True),
            )
        )

    total = query.count()

    column = _SORT_COLUMNS[sort_by]
    ordering = column.asc() if sort_order == SortOrder.ASC else column.desc()
    # Candidate.id breaks ties so pages stay stable when the sort column has duplicates.
    items = (
        query.order_by(ordering, Candidate.id).offset((page - 1) * per_page).limit(per_page).all()
    )

    return PaginatedCandidatesResponse(
        items=[CandidateResponse.model_validate(item) for item in items],
        pagination=PaginationMeta.build(page=page, per_page=per_page, total_items=total),
    )


@router.post(
    "",
    response_model=CandidateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a candidate",
)
def create_candidate(
    payload: CreateCandidateRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Candidate:
    """Add a candidate to the current organization. Admin or recruiter only."""
    candidate = Candidate(
        id=uuid.uuid4(),
        org_id=current_user.org_id,
        **payload.model_dump(),
    )
    db.add(candidate)
    # Audit details carry no personal data: the audit log outlives a deleted candidate.
    log_audit_event(
        db=db,
        org_id=candidate.org_id,
        action="create_candidate",
        target_entity="candidate",
        target_id=candidate.id,
        user_id=current_user.id,
        details={"consent_given": candidate.consent_given_at is not None},
        request=request,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _DUPLICATE_EMAIL from None
    db.refresh(candidate)
    return candidate


@router.get(
    "/{id}",
    response_model=CandidateResponse,
    summary="Get a candidate",
)
def get_candidate(
    id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> Candidate:
    """Return a single candidate from the current organization."""
    return _get_candidate_or_404(db, id)


@router.patch(
    "/{id}",
    response_model=CandidateResponse,
    summary="Update a candidate",
)
def update_candidate(
    id: uuid.UUID,
    payload: UpdateCandidateRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> Candidate:
    """Partially update a candidate. Admin or recruiter only."""
    candidate = _get_candidate_or_404(db, id)

    changes = {
        field: value
        for field, value in payload.model_dump(exclude_unset=True).items()
        if getattr(candidate, field) != value
    }
    if not changes:
        return candidate

    for field, value in changes.items():
        setattr(candidate, field, value)
    log_audit_event(
        db=db,
        org_id=candidate.org_id,
        action="update_candidate",
        target_entity="candidate",
        target_id=candidate.id,
        user_id=current_user.id,
        details={"changed_fields": sorted(changes)},
        request=request,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _DUPLICATE_EMAIL from None
    db.refresh(candidate)
    return candidate


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete a candidate",
)
def delete_candidate(
    id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_tenant_db),
    storage: Storage = Depends(get_storage),
    current_user: User = Depends(get_current_admin),
) -> Response:
    """Hard-delete a candidate with their applications, stage history, scores and CV files.

    Admin only.
    """
    candidate = _get_candidate_or_404(db, id)
    storage_keys = [document.storage_key for document in candidate.cv_documents]

    log_audit_event(
        db=db,
        org_id=candidate.org_id,
        action="delete_candidate",
        target_entity="candidate",
        target_id=candidate.id,
        user_id=current_user.id,
        details={
            "applications_deleted": len(candidate.applications),
            "cv_files_deleted": len(storage_keys),
        },
        request=request,
    )
    db.delete(candidate)
    db.commit()
    # Files go after the commit: a failed commit must not leave records without files.
    for key in storage_keys:
        try:
            storage.delete(key)
        except Exception:
            logger.exception("Could not delete a stored CV file of deleted candidate=%s", id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
