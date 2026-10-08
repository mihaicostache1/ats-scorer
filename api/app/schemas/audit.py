"""Audit schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventResponse(BaseModel):
    """Schema for a single audit event returned in the API."""

    id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    target_entity: str
    target_id: uuid.UUID | None
    details: dict[str, Any]
    ip_address: str | None
    user_agent: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedAuditEvents(BaseModel):
    """Paginated list of audit events."""

    items: list[AuditEventResponse]
    total: int
    page: int
    size: int
