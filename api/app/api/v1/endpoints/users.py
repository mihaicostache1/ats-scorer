"""User API endpoints."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import UserPublic

router = APIRouter(prefix="", tags=["Users"])

@router.get(
    "/me",
    response_model=UserPublic,
    summary="Return current authenticated user profile",
)
def me(current_user: User = Depends(get_current_user)) -> User:
    """Return the currently authenticated user."""
    return current_user
