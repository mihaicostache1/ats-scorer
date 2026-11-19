"""Current-user profile and admin-only workspace user management."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin, get_current_user, get_tenant_db
from app.models.user import User
from app.schemas.auth import UserPublic
from app.schemas.pagination import PaginationMeta
from app.schemas.user import (
    InviteUserRequest,
    PaginatedUsersResponse,
    UpdateUserRoleRequest,
    UserInvitationResponse,
    UserRole,
)
from app.services import user_service
from app.services.audit_service import log_audit_event

router = APIRouter(prefix="", tags=["Users"])


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Return current authenticated user profile",
)
def me(current_user: User = Depends(get_current_user)) -> User:
    """Return the currently authenticated user."""
    return current_user


@router.get("/users", response_model=PaginatedUsersResponse, summary="List workspace users")
def list_users(
    request: Request,
    role: UserRole | None = Query(None),
    is_active: bool | None = Query(None),
    search: str | None = Query(None, max_length=255),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_tenant_db),
    admin: User = Depends(get_current_admin),
) -> PaginatedUsersResponse:
    """List members, including inactive accounts. Only admins in the same workspace can read."""
    query = db.query(User).filter(User.org_id == admin.org_id)
    if role is not None:
        query = query.filter(User.role == role.value)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    term = search.strip() if search else ""
    if term:
        query = query.filter(
            or_(
                User.email.icontains(term, autoescape=True),
                User.full_name.icontains(term, autoescape=True),
            )
        )
    total = query.count()
    members = (
        query.order_by(User.created_at, User.id).offset((page - 1) * per_page).limit(per_page).all()
    )
    result = PaginatedUsersResponse(
        items=[UserPublic.model_validate(member) for member in members],
        pagination=PaginationMeta.build(page, per_page, total),
    )
    log_audit_event(
        db=db,
        org_id=admin.org_id,
        action="list_users",
        target_entity="user",
        user_id=admin.id,
        details={"page": page, "per_page": per_page},
        request=request,
    )
    db.commit()
    return result


@router.post(
    "/users/invitations",
    response_model=UserInvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a shareable user invitation",
)
def invite_user(
    payload: InviteUserRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_tenant_db),
    admin: User = Depends(get_current_admin),
) -> UserInvitationResponse:
    """Return a single-use link for the admin to share. No email is sent."""
    response.headers["Cache-Control"] = "no-store"
    return user_service.invite_user(db, admin, payload, request)


@router.patch(
    "/users/{id}/role", response_model=UserPublic, summary="Change a workspace user's role"
)
def change_user_role(
    id: uuid.UUID,
    payload: UpdateUserRoleRequest,
    request: Request,
    db: Session = Depends(get_tenant_db),
    admin: User = Depends(get_current_admin),
) -> User:
    """Change role immediately, including for existing sessions; preserve the last admin."""
    return user_service.change_user_role(db, admin, id, payload.role, request)


@router.post(
    "/users/{id}/deactivate", response_model=UserPublic, summary="Deactivate a workspace user"
)
def deactivate_user(
    id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_tenant_db),
    admin: User = Depends(get_current_admin),
) -> User:
    """Deactivate another member. Existing access and refresh tokens are rejected afterwards."""
    return user_service.deactivate_user(db, admin, id, request)
