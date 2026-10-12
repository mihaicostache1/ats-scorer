"""Job schemas."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.pagination import PaginationMeta


class JobStatus(StrEnum):
    """All job statuses a posting can be in (and be filtered by)."""

    DRAFT = "draft"
    OPEN = "open"
    PAUSED = "paused"
    CLOSED = "closed"
    ARCHIVED = "archived"


class JobSortField(StrEnum):
    """Columns the job list can be sorted by."""

    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"
    TITLE = "title"
    STATUS = "status"


class SortOrder(StrEnum):
    """Sort direction."""

    ASC = "asc"
    DESC = "desc"


class CreateJobRequest(BaseModel):
    """Payload for creating a job posting. New jobs always start as ``draft``."""

    title: str = Field(..., min_length=1, max_length=255)
    department: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=100)
    employment_type: str = Field("full_time", min_length=1, max_length=50)
    description: str = Field(..., min_length=1)
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    min_experience_years: int = Field(0, ge=0)


class UpdateJobRequest(BaseModel):
    """Partial update of a job posting; omitted fields are left unchanged."""

    title: str | None = Field(None, min_length=1, max_length=255)
    department: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=100)
    employment_type: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = Field(None, min_length=1)
    required_skills: list[str] | None = None
    preferred_skills: list[str] | None = None
    min_experience_years: int | None = Field(None, ge=0)

    @model_validator(mode="after")
    def _reject_null_for_required_columns(self) -> Self:
        """Only department and location may be cleared with an explicit ``null``."""
        for field in self.model_fields_set - {"department", "location"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class UpdateJobStatusRequest(BaseModel):
    """Payload for a status change. Archiving goes through its own endpoint."""

    status: Literal[JobStatus.DRAFT, JobStatus.OPEN, JobStatus.CLOSED]


class JobResponse(BaseModel):
    """Schema for a single job posting returned in the API."""

    id: uuid.UUID
    org_id: uuid.UUID
    title: str
    department: str | None
    location: str | None
    employment_type: str
    status: str
    description: str
    required_skills: list[str]
    preferred_skills: list[str]
    min_experience_years: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedJobsResponse(BaseModel):
    """Paginated list of job postings."""

    items: list[JobResponse]
    pagination: PaginationMeta
