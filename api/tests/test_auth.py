"""Auth endpoint tests.

Covers:
  - Happy path: register org+admin, login, refresh, logout, /me
  - Wrong password -> 401
  - Expired access token -> 401
  - Expired refresh token -> 401
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_expired_access_token(user: User) -> str:
    """Create an already-expired access JWT for testing."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "org": str(user.org_id),
        "role": user.role,
        "type": "access",
        "iat": now - timedelta(hours=2),
        "exp": now - timedelta(hours=1),  # expired 1 hour ago
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _make_expired_refresh_token(user: User) -> str:
    """Create an already-expired refresh JWT for testing."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "iat": now - timedelta(days=8),
        "exp": now - timedelta(days=1),  # expired yesterday
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


REGISTER_PAYLOAD = {
    "org_name": "Acme Corp",
    "org_slug": f"acme-{uuid.uuid4().hex[:6]}",
    "admin_full_name": "Alice Admin",
    "admin_email": f"alice-{uuid.uuid4().hex[:6]}@acme.com",
    "admin_password": "SuperSecret123!",
}

LOGIN_PAYLOAD = {
    "email": REGISTER_PAYLOAD["admin_email"],
    "password": REGISTER_PAYLOAD["admin_password"],
}


# ---------------------------------------------------------------------------
# Happy-path: full register -> login -> /me -> refresh -> logout flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_creates_org_and_sets_cookies(async_client: AsyncClient) -> None:
    """POST /auth/register returns 201 and sets httpOnly cookies."""
    response = await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201, response.text

    body = response.json()
    assert body["role"] == "admin"
    assert "user_id" in body
    assert "org_id" in body

    # Tokens delivered via cookies, NOT in body
    assert "access_token" not in body
    assert "refresh_token" not in body
    assert settings.ACCESS_COOKIE_NAME in response.cookies
    assert settings.REFRESH_COOKIE_NAME in response.cookies


@pytest.mark.asyncio
async def test_login_happy_path(async_client: AsyncClient) -> None:
    """POST /auth/login with correct credentials returns 200 and sets cookies."""
    # First ensure the user exists
    await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    response = await async_client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)
    assert response.status_code == 200, response.text

    assert settings.ACCESS_COOKIE_NAME in response.cookies
    assert settings.REFRESH_COOKIE_NAME in response.cookies


@pytest.mark.asyncio
async def test_me_returns_current_user(async_client: AsyncClient) -> None:
    """GET /auth/me returns user profile when access cookie is present."""
    await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    login_resp = await async_client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)
    assert login_resp.status_code == 200

    me_resp = await async_client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == REGISTER_PAYLOAD["admin_email"]
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_refresh_issues_new_tokens(async_client: AsyncClient) -> None:
    """POST /auth/refresh with valid refresh cookie issues new tokens."""
    await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    await async_client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)

    response = await async_client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert settings.ACCESS_COOKIE_NAME in response.cookies


@pytest.mark.asyncio
async def test_logout_clears_cookies(async_client: AsyncClient) -> None:
    """POST /auth/logout clears auth cookies."""
    await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    await async_client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)

    response = await async_client.post("/api/v1/auth/logout")
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out successfully"


# ---------------------------------------------------------------------------
# Wrong-password path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(async_client: AsyncClient) -> None:
    """POST /auth/login with wrong password returns 401."""
    await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["admin_email"], "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert "Incorrect" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_user_returns_401(async_client: AsyncClient) -> None:
    """POST /auth/login with unknown email returns 401 (not 404 – avoids user enumeration)."""
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@nowhere.com", "password": "SomePassword1!"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Expired-token paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_with_expired_access_token_returns_401(
    async_client: AsyncClient, db_session: Session
) -> None:
    """GET /auth/me with an expired access cookie returns 401."""
    # Create org + user directly in DB
    org = Organization(id=uuid.uuid4(), name="Exp Org", slug=f"exp-{uuid.uuid4().hex[:6]}")
    db_session.add(org)
    db_session.commit()
    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email=f"exp-{uuid.uuid4().hex[:6]}@test.com",
        hashed_password=hash_password("Secret123!"),
        full_name="Expired User",
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    expired_token = _make_expired_access_token(user)
    async_client.cookies.set(settings.ACCESS_COOKIE_NAME, expired_token)

    response = await async_client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_expired_refresh_token_returns_401(
    async_client: AsyncClient, db_session: Session
) -> None:
    """POST /auth/refresh with an expired refresh cookie returns 401."""
    org = Organization(id=uuid.uuid4(), name="Exp Org2", slug=f"exp2-{uuid.uuid4().hex[:6]}")
    db_session.add(org)
    db_session.commit()
    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email=f"exp2-{uuid.uuid4().hex[:6]}@test.com",
        hashed_password=hash_password("Secret123!"),
        full_name="Expired Refresh User",
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    expired_refresh = _make_expired_refresh_token(user)
    async_client.cookies.set(settings.REFRESH_COOKIE_NAME, expired_refresh)

    response = await async_client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Password-not-logged guard (unit test, no DB)
# ---------------------------------------------------------------------------


def test_password_never_appears_in_logs(caplog: pytest.LogCaptureFixture) -> None:
    """Verify that hash_password and verify_password never emit the plain password to logs."""
    import logging

    from app.core.security import hash_password as hp
    from app.core.security import verify_password as vp

    secret = "MySuperSecret_Password_99!"
    with caplog.at_level(logging.DEBUG):
        hashed = hp(secret)
        vp(secret, hashed)
        vp("wrong", hashed)

    for record in caplog.records:
        assert secret not in record.getMessage(), (
            f"Plain password leaked in log record: {record.getMessage()}"
        )


# ---------------------------------------------------------------------------
# Rate limiting test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_is_rate_limited(async_client: AsyncClient) -> None:
    """POST /auth/login is rate limited to 10 requests per minute."""
    from app.api.v1.endpoints.auth import limiter

    limiter.reset()
    try:
        # Send 10 requests (within limit)
        for _ in range(10):
            resp = await async_client.post(
                "/api/v1/auth/login",
                json={"email": "ratelimit@example.com", "password": "WrongPassword123!"},
            )
            assert resp.status_code == 401

        # 11th request exceeds limit -> 429 Too Many Requests
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": "ratelimit@example.com", "password": "WrongPassword123!"},
        )
        assert resp.status_code == 429
    finally:
        limiter.reset()
