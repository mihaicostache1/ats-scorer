"""Candidate schemas."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.pagination import PaginationMeta


class CandidateSortField(StrEnum):
    """Columns the candidate list can be sorted by."""

    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"
    FULL_NAME = "full_name"
    EMAIL = "email"


class CreateCandidateRequest(BaseModel):
    """Payload for adding a candidate. ``consent_given_at`` stays null until consent is recorded."""

    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr = Field(..., max_length=255)
    phone: str | None = Field(None, max_length=50)
    location: str | None = Field(None, max_length=255)
    consent_given_at: AwareDatetime | None = None

    @field_validator("email")
    @classmethod
    def _lowercase_email(cls, value: str) -> str:
        """Emails are unique per organization regardless of case."""
        return value.lower()


class UpdateCandidateRequest(BaseModel):
    """Partial update of a candidate; omitted fields are left unchanged."""

    full_name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    location: str | None = Field(None, max_length=255)
    consent_given_at: AwareDatetime | None = None

    @field_validator("email")
    @classmethod
    def _lowercase_email(cls, value: str | None) -> str | None:
        """Emails are unique per organization regardless of case."""
        return value.lower() if value else value

    @model_validator(mode="after")
    def _reject_null_for_required_columns(self) -> Self:
        """Only phone, location and consent_given_at may be cleared with an explicit ``null``."""
        for field in self.model_fields_set - {"phone", "location", "consent_given_at"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class CandidateResponse(BaseModel):
    """Schema for a single candidate returned in the API."""

    id: uuid.UUID
    org_id: uuid.UUID
    full_name: str
    email: str
    phone: str | None
    location: str | None
    cv_file_path: str | None
    parsed_data: dict[str, Any]
    consent_given_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedCandidatesResponse(BaseModel):
    """Paginated list of candidates."""

    items: list[CandidateResponse]
    pagination: PaginationMeta
