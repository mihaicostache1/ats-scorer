"""FastAPI shared dependencies: authenticated current-user injection."""

import uuid

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User


def get_current_user(
    access_token: str | None = Cookie(default=None, alias=settings.ACCESS_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    """Resolve and return the authenticated user from the httpOnly access-token cookie.

    Raises HTTP 401 if the cookie is absent or the token is invalid/expired.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if access_token is None:
        raise credentials_exc

    try:
        payload = decode_access_token(access_token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc from None

    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require the current user to have the ``admin`` role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
