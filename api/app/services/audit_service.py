"""Audit Service."""

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def log_audit_event(
    db: Session,
    org_id: uuid.UUID,
    action: str,
    target_entity: str,
    target_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditEvent:
    """Log an audit event to the database."""
    ip_address = None
    user_agent = None
    if request:
        if request.client:
            ip_address = request.client.host
        user_agent = request.headers.get("user-agent")

    event = AuditEvent(
        org_id=org_id,
        user_id=user_id,
        action=action,
        target_entity=target_entity,
        target_id=target_id,
        details=details or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(event)
    # The caller is responsible for committing the transaction.
    return event
