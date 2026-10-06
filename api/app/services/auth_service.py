"""Authentication service: org+admin registration, login, token refresh, logout."""

import uuid

from fastapi import HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import LoginRequest, OrgRegisterRequest, TokenResponse

# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Write both tokens into httpOnly, SameSite cookies on *response*."""
    domain = settings.COOKIE_DOMAIN or None
    samesite = settings.COOKIE_SAMESITE
    secure = settings.COOKIE_SECURE

    response.set_cookie(
        key=settings.ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        samesite=samesite,
        secure=secure,
        domain=domain,
    )
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",  # scope refresh cookie to refresh endpoint
        httponly=True,
        samesite=samesite,
        secure=secure,
        domain=domain,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire both auth cookies."""
    response.delete_cookie(settings.ACCESS_COOKIE_NAME)
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/api/v1/auth/refresh")


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


def register_org_and_admin(
    payload: OrgRegisterRequest, db: Session, response: Response
) -> TokenResponse:
    """Create a new Organisation and its first admin User, then issue tokens."""
    # 1. Create org
    org = Organization(
        id=uuid.uuid4(),
        name=payload.org_name,
        slug=payload.org_slug,
    )
    db.add(org)

    # 2. Create admin user – password hashed, never stored or logged in plain form
    admin = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email=payload.admin_email,
        hashed_password=hash_password(payload.admin_password),
        full_name=payload.admin_full_name,
        role="admin",
        is_active=True,
    )
    db.add(admin)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organisation slug or email already exists",
        ) from None

    db.refresh(org)
    db.refresh(admin)
    logger.info("Registered new org=%s admin_user=%s", org.slug, admin.id)

    # 3. Issue tokens via cookies
    access_token = create_access_token(user_id=str(admin.id), org_id=str(org.id), role=admin.role)
    refresh_token = create_refresh_token(user_id=str(admin.id))
    _set_auth_cookies(response, access_token, refresh_token)

    return TokenResponse(user_id=admin.id, org_id=org.id, role=admin.role)


def login(payload: LoginRequest, db: Session, response: Response) -> TokenResponse:
    """Authenticate credentials and issue tokens.

    The plain password is *never* logged; only the email is referenced in logs.
    """
    # Lookup by email – we find the user globally (email unique per org, but we
    # allow login without specifying org slug for now).
    user = db.query(User).filter(User.email == payload.email).first()

    # Use constant-time path: always call verify even on missing user to
    # avoid timing oracle.
    stored_hash = user.hashed_password if user else DUMMY_HASH
    password_ok = verify_password(payload.password, stored_hash)

    if not user or not password_ok or not user.is_active:
        logger.warning("Failed login attempt for email=%s", payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Opportunistic rehash if Argon2 params changed
    if needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(payload.password)
        db.commit()
        logger.info("Rehashed password for user=%s", user.id)

    access_token = create_access_token(
        user_id=str(user.id), org_id=str(user.org_id), role=user.role
    )
    refresh_token = create_refresh_token(user_id=str(user.id))
    _set_auth_cookies(response, access_token, refresh_token)

    logger.info("Successful login for user=%s", user.id)
    return TokenResponse(user_id=user.id, org_id=user.org_id, role=user.role)


def refresh(refresh_token_value: str | None, db: Session, response: Response) -> TokenResponse:
    """Issue a new access token from a valid refresh token."""
    from jose import JWTError

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    if not refresh_token_value:
        raise credentials_exc

    try:
        payload = decode_refresh_token(refresh_token_value)
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise credentials_exc
    except JWTError:
        raise credentials_exc from None

    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user or not user.is_active:
        raise credentials_exc

    new_access = create_access_token(user_id=str(user.id), org_id=str(user.org_id), role=user.role)
    new_refresh = create_refresh_token(user_id=str(user.id))
    _set_auth_cookies(response, new_access, new_refresh)

    logger.info("Token refreshed for user=%s", user.id)
    return TokenResponse(user_id=user.id, org_id=user.org_id, role=user.role)


def logout(response: Response) -> dict[str, str]:
    """Invalidate the client-side tokens by clearing the cookies."""
    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}
