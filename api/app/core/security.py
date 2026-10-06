"""Security utilities: Argon2 password hashing and JWT token handling.

Passwords are NEVER logged anywhere in this module.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

# ---------------------------------------------------------------------------
# Argon2 hasher – tune params for server hardware; these are sane defaults
# ---------------------------------------------------------------------------
_ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

# Valid Argon2 hash used on login miss to mitigate timing oracle attacks
DUMMY_HASH = str(_ph.hash("ats_dummy_timing_mitigation_password"))


def hash_password(plain_password: str) -> str:
    """Return Argon2 hash of *plain_password*. The raw password is never passed to the logger."""
    return str(_ph.hash(plain_password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify *plain_password* against *hashed_password*. Never logs the plain password."""
    try:
        return bool(_ph.verify(hashed_password, plain_password))
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False


def needs_rehash(hashed_password: str) -> bool:
    """Return True if the stored hash should be upgraded (e.g. params changed)."""
    return bool(_ph.check_needs_rehash(hashed_password))


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

_ACCESS = "access"
_REFRESH = "refresh"


def _create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    """Internal: encode a signed JWT with *subject* and *token_type*."""
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    encoded = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return str(encoded)


def create_access_token(user_id: str, org_id: str, role: str) -> str:
    """Create a short-lived access JWT carrying user identity claims."""
    now = datetime.now(UTC)
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "org": org_id,
        "role": role,
        "type": _ACCESS,
        "iat": now,
        "exp": now + expires,
    }
    encoded = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return str(encoded)


def create_refresh_token(user_id: str) -> str:
    """Create a long-lived refresh JWT."""
    return _create_token(
        subject=user_id,
        token_type=_REFRESH,
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token. Raises JWTError on invalid/expired tokens."""
    payload: dict[str, Any] = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    if payload.get("type") != _ACCESS:
        raise JWTError("token type mismatch: expected access")
    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Decode and validate a refresh token. Raises JWTError on invalid/expired tokens."""
    payload: dict[str, Any] = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    if payload.get("type") != _REFRESH:
        raise JWTError("token type mismatch: expected refresh")
    return payload
