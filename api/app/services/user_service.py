"""Tenant-scoped user administration and atomic, single-use invite redemption."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User
from app.models.user_invitation import UserInvitation
from app.schemas.user import (
    AcceptInvitationRequest,
    InviteUserRequest,
    UserInvitationResponse,
    UserRole,
)
from app.services.audit_service import log_audit_event


def _lock_organization(db: Session, org_id: uuid.UUID) -> None:
    """Serialize membership writes, always locking the organization before any invitation.

    Counting admins without this lock allows two simultaneous demotions to remove both.
    All membership writes, including invite acceptance, use this same lock order.
    """
    # PostgreSQL NO KEY UPDATE allows unrelated inserts with an organization foreign key.
    db.query(Organization).filter(Organization.id == org_id).with_for_update(key_share=True).one()


def _lock_admin(db: Session, admin: User) -> None:
    _lock_organization(db, admin.org_id)
    # Authentication may have happened before another admin deactivated/demoted this one.
    db.refresh(admin)
    if not admin.is_active or admin.role != UserRole.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")


def _get_user(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> User:
    user = (
        db.query(User).filter(User.org_id == org_id, User.id == user_id).populate_existing().first()
    )
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User was not found")
    return user


def _protect_last_admin(db: Session, user: User) -> None:
    if not user.is_active or user.role != UserRole.ADMIN:
        return
    active_admins = (
        db.query(User)
        .filter(User.org_id == user.org_id, User.role == UserRole.ADMIN, User.is_active.is_(True))
        .count()
    )
    if active_admins <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "The last active admin cannot be removed")


def _email_exists(db: Session, org_id: uuid.UUID, email: str) -> bool:
    return (
        db.query(User.id).filter(User.org_id == org_id, func.lower(User.email) == email).first()
        is not None
    )


def invite_user(
    db: Session, admin: User, payload: InviteUserRequest, request: Request
) -> UserInvitationResponse:
    """Issue a 256-bit bearer secret; supersede any older unused invitation for this email."""
    _lock_admin(db, admin)
    if _email_exists(db, admin.org_id, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    now = datetime.now(UTC)
    previous = (
        db.query(UserInvitation)
        .filter(
            UserInvitation.org_id == admin.org_id,
            UserInvitation.email == payload.email,
            UserInvitation.used_at.is_(None),
            UserInvitation.revoked_at.is_(None),
        )
        .all()
    )
    for invitation in previous:
        invitation.revoked_at = now

    token = secrets.token_urlsafe(32)
    invitation = UserInvitation(
        id=uuid.uuid4(),
        org_id=admin.org_id,
        email=payload.email,
        role=payload.role.value,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        created_by=admin.id,
        expires_at=now + timedelta(hours=settings.USER_INVITE_EXPIRE_HOURS),
    )
    db.add(invitation)
    log_audit_event(
        db=db,
        org_id=admin.org_id,
        action="invite_user",
        target_entity="user_invitation",
        target_id=invitation.id,
        user_id=admin.id,
        details={
            "email": invitation.email,
            "role": invitation.role,
            "superseded_invitation_ids": [str(item.id) for item in previous],
        },
        request=request,
    )
    db.commit()
    # A fragment keeps the bearer secret out of web-server query strings and referrers.
    invite_url = f"{settings.INVITE_ACCEPT_URL}#token={token}"
    return UserInvitationResponse(
        id=invitation.id,
        email=invitation.email,
        role=UserRole(invitation.role),
        expires_at=invitation.expires_at,
        invite_url=invite_url,
    )


def accept_invitation(db: Session, payload: AcceptInvitationRequest, request: Request) -> User:
    """Consume the token and create the user in the same transaction as the audit event."""
    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired invitation")
    digest = hashlib.sha256(payload.token.get_secret_value().encode()).hexdigest()
    org_id = db.query(UserInvitation.org_id).filter(UserInvitation.token_hash == digest).scalar()
    if org_id is None:
        raise invalid

    _lock_organization(db, org_id)
    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.token_hash == digest)
        .populate_existing()
        .with_for_update()
        .first()
    )
    now = datetime.now(UTC)
    if (
        invitation is None
        or invitation.used_at is not None
        or invitation.revoked_at is not None
        or invitation.expires_at <= now
    ):
        raise invalid
    if _email_exists(db, invitation.org_id, invitation.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    user = User(
        id=uuid.uuid4(),
        org_id=invitation.org_id,
        email=invitation.email,
        hashed_password=hash_password(payload.password.get_secret_value()),
        full_name=payload.full_name,
        role=invitation.role,
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
        invitation.used_at = now
        invitation.accepted_by = user.id
        log_audit_event(
            db=db,
            org_id=user.org_id,
            action="accept_invitation",
            target_entity="user",
            target_id=user.id,
            user_id=user.id,
            details={"invitation_id": str(invitation.id), "role": user.role},
            request=request,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A user with this email already exists"
        ) from None
    db.refresh(user)
    return user


def change_user_role(
    db: Session, admin: User, user_id: uuid.UUID, role: UserRole, request: Request
) -> User:
    """Change a workspace role, preserving at least one active admin."""
    _lock_admin(db, admin)
    user = _get_user(db, admin.org_id, user_id)
    if user.role == role:
        return user
    if role != UserRole.ADMIN:
        _protect_last_admin(db, user)
    previous = user.role
    user.role = role.value
    log_audit_event(
        db=db,
        org_id=user.org_id,
        action="change_user_role",
        target_entity="user",
        target_id=user.id,
        user_id=admin.id,
        details={"from": previous, "to": role.value},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user


def deactivate_user(db: Session, admin: User, user_id: uuid.UUID, request: Request) -> User:
    """Deactivate another member. Existing access and refresh cookies stop working immediately."""
    _lock_admin(db, admin)
    user = _get_user(db, admin.org_id, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot deactivate your own account")
    if not user.is_active:
        return user
    _protect_last_admin(db, user)
    user.is_active = False
    log_audit_event(
        db=db,
        org_id=user.org_id,
        action="deactivate_user",
        target_entity="user",
        target_id=user.id,
        user_id=admin.id,
        details={"from": True, "to": False},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user
