"""Audit API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin, get_tenant_db
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.schemas.audit import PaginatedAuditEvents

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get(
    "/events",
    response_model=PaginatedAuditEvents,
    summary="List paginated audit events for the current organization",
)
def list_audit_events(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_tenant_db),
    _current_admin: User = Depends(get_current_admin),
) -> PaginatedAuditEvents:
    """Return a paginated list of audit events. Admin only."""
    offset = (page - 1) * size
    
    query = db.query(AuditEvent).order_by(AuditEvent.created_at.desc())
    
    total = query.count()
    items = query.offset(offset).limit(size).all()
    
    return PaginatedAuditEvents(
        items=items,
        total=total,
        page=page,
        size=size,
    )
