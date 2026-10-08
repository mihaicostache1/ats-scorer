"""Authentication API endpoints.

Tokens are delivered exclusively via httpOnly cookies (agreed with the
frontend team). The response body carries non-sensitive identity info only.
"""

from fastapi import APIRouter, Cookie, Depends, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, OrgRegisterRequest, TokenResponse, UserPublic
from app.services.auth_service import (
    login as svc_login,
)
from app.services.auth_service import (
    logout as svc_logout,
)
from app.services.auth_service import (
    refresh as svc_refresh,
)
from app.services.auth_service import (
    register_org_and_admin,
)

router = APIRouter(prefix="/auth", tags=["Auth"])

# Rate limiter keyed on client IP
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------
@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register organisation and first admin",
)
def register(
    request: Request,
    payload: OrgRegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Create a new Organisation and its first admin user, then issue tokens."""
    return register_org_and_admin(payload, db, response, request)


# ---------------------------------------------------------------------------
# POST /auth/login  (rate-limited)
# ---------------------------------------------------------------------------
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login – rate limited to 10 req/min per IP",
)
@limiter.limit(settings.LOGIN_RATE_LIMIT)
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate credentials and issue access + refresh tokens via cookies."""
    return svc_login(payload, db, response, request)


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------
@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token using the httpOnly refresh cookie",
)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=settings.REFRESH_COOKIE_NAME),
) -> TokenResponse:
    """Issue a new access token from a valid refresh token cookie."""
    return svc_refresh(refresh_token, db, response)


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------
@router.post(
    "/logout",
    summary="Logout – clears auth cookies",
)
def logout(
    response: Response,
    _current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Invalidate the session by expiring the httpOnly cookies."""
    return svc_logout(response)


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
@router.get(
    "/me",
    response_model=UserPublic,
    summary="Return current authenticated user profile",
)
def me(current_user: User = Depends(get_current_user)) -> User:
    """Return the currently authenticated user."""
    return current_user
