"""Pydantic schemas for the authentication endpoints."""

import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator


class OrgRegisterRequest(BaseModel):
    """Payload for registering a new organisation and its first admin user."""

    org_name: str = Field(..., min_length=2, max_length=255)
    org_slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    admin_full_name: str = Field(..., min_length=2, max_length=255)
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8)

    @field_validator("admin_password")
    @classmethod
    def password_not_trivial(cls, v: str) -> str:
        if v.lower() in {"password", "12345678", "qwertyui"}:
            raise ValueError("Password is too common")
        return v


class LoginRequest(BaseModel):
    """Payload for logging in."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """Returned in the response body alongside the httpOnly cookies."""

    token_type: str = "bearer"
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    message: str = "Tokens issued via httpOnly cookies"


class UserPublic(BaseModel):
    """Public projection of a user record."""

    id: uuid.UUID
    org_id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}
