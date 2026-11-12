"""User administration and invitation payloads."""

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from app.schemas.auth import UserPublic
from app.schemas.pagination import PaginationMeta


class UserRole(StrEnum):
    """Workspace roles supported by B-6."""

    ADMIN = "admin"
    RECRUITER = "recruiter"
    VIEWER = "viewer"


class InviteUserRequest(BaseModel):
    """An admin chooses the email and role; the invitee chooses their name and password."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=255)
    role: UserRole = UserRole.RECRUITER

    @field_validator("email")
    @classmethod
    def _lowercase_email(cls, value: str) -> str:
        return value.lower()


class UserInvitationResponse(BaseModel):
    """The shareable link is returned only when the invitation is issued."""

    id: uuid.UUID
    email: str
    role: UserRole
    expires_at: datetime
    invite_url: str


class AcceptInvitationRequest(BaseModel):
    """Public redemption payload. Email, role and organization come exclusively from the token."""

    model_config = ConfigDict(extra="forbid")

    token: SecretStr = Field(min_length=1, max_length=256)
    full_name: str = Field(min_length=2, max_length=255)
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        name = value.strip()
        if len(name) < 2:
            raise ValueError("Full name must contain at least two non-whitespace characters")
        return name

    @field_validator("password")
    @classmethod
    def _password_not_trivial(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value().lower() in {"password", "12345678", "qwertyui"}:
            raise ValueError("Password is too common")
        return value


class UpdateUserRoleRequest(BaseModel):
    """Role updates cannot change identity, organization or active status."""

    model_config = ConfigDict(extra="forbid")

    role: UserRole


class PaginatedUsersResponse(BaseModel):
    """The standard pagination envelope, including inactive users unless filtered."""

    items: list[UserPublic]
    pagination: PaginationMeta
