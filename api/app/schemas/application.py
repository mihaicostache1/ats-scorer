"""Application, pipeline stage and stage history schemas."""

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.pagination import PaginationMeta


class ApplicationStatus(StrEnum):
    """Overall application states, derived from the type of the current stage."""

    ACTIVE = "active"
    HIRED = "hired"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class CreateApplicationRequest(BaseModel):
    """Payload linking a candidate to a job. The application starts in the first stage."""

    job_id: uuid.UUID
    candidate_id: uuid.UUID


class UpdateStageRequest(BaseModel):
    """Payload for moving an application to another pipeline stage."""

    stage_id: uuid.UUID
    reason: str | None = Field(None, max_length=2000)

    @field_validator("reason")
    @classmethod
    def _blank_reason_is_none(cls, value: str | None) -> str | None:
        """Treat an empty or whitespace-only reason as not given."""
        return (value.strip() or None) if value else None


class ApplicationResponse(BaseModel):
    """Schema for a single application returned in the API."""

    id: uuid.UUID
    org_id: uuid.UUID
    job_id: uuid.UUID
    candidate_id: uuid.UUID
    stage_id: uuid.UUID
    status: str
    rejection_reason: str | None
    applied_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedApplicationsResponse(BaseModel):
    """Paginated list of applications."""

    items: list[ApplicationResponse]
    pagination: PaginationMeta


class PipelineStageResponse(BaseModel):
    """Schema for a pipeline stage. ``job_id`` is null for an org-default stage."""

    id: uuid.UUID
    org_id: uuid.UUID
    job_id: uuid.UUID | None
    name: str
    stage_order: int
    stage_type: str

    model_config = ConfigDict(from_attributes=True)


class StageHistoryResponse(BaseModel):
    """One stage an application entered. ``from_stage_id`` is null for the initial placement."""

    id: uuid.UUID
    application_id: uuid.UUID
    from_stage_id: uuid.UUID | None
    to_stage_id: uuid.UUID
    reason: str | None
    overall_score: float | None
    model_version: str | None
    moved_by: uuid.UUID | None
    moved_at: datetime

    model_config = ConfigDict(from_attributes=True)
