"""FastAPI shared dependencies: authenticated current-user injection."""

import uuid

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.base_class import Base
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


def get_current_recruiter_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require the current user to have at least ``recruiter`` role (admin or recruiter)."""
    if current_user.role not in ("admin", "recruiter"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough privileges",
        )
    return current_user


def get_tenant_db(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Session:
    """Return a database session automatically scoped to the current user's organization."""
    from sqlalchemy import event, true
    from sqlalchemy.orm import ORMExecuteState, with_loader_criteria

    org_id_val = current_user.org_id

    @event.listens_for(db, "do_orm_execute")
    def _add_tenant_filter(execute_state: ORMExecuteState) -> None:
        if (
            execute_state.is_select
            and not execute_state.is_column_load
            and not execute_state.is_relationship_load
        ):
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    Base,
                    lambda cls: (
                        cls.org_id == org_id_val if hasattr(cls, "org_id") else true()
                    ),
                    include_aliases=True,
                    track_closure_variables=False,
                )
            )

    return db
