"""B-15: admin authorization, tenant isolation, invitation lifecycle and membership races."""

import hashlib
import json
import threading
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException, Request
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_refresh_token, verify_password
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.models.user_invitation import UserInvitation
from app.schemas.user import AcceptInvitationRequest, UserRole
from app.services import user_service

PASSWORD = "InviteeSecret123!"
INVITEE = {"email": "colleague@example.com", "role": "recruiter"}
REDEMPTION = {"full_name": "New Colleague", "password": PASSWORD}


def token_from(response: dict[str, str]) -> str:
    """The fragment is for the frontend form; it is never sent in an HTTP request URL."""
    return parse_qs(urlsplit(response["invite_url"]).fragment)["token"][0]


@pytest.mark.asyncio
async def test_list_users_is_paginated_scoped_and_audited(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    admin = create_user()
    recruiter = create_user("recruiter", org_id=admin.org_id)
    inactive = create_user("viewer", org_id=admin.org_id)
    inactive.is_active = False
    outsider = create_user()
    committed_db.commit()
    login_as(admin)

    response = await async_client.get("/api/v1/users", params={"per_page": 2})
    assert response.status_code == 200
    data = response.json()
    assert data["pagination"] == {
        "page": 1,
        "per_page": 2,
        "total_items": 3,
        "total_pages": 2,
        "has_next": True,
        "has_prev": False,
    }
    second = (await async_client.get("/api/v1/users?page=2&per_page=2")).json()
    assert {item["id"] for item in data["items"] + second["items"]} == {
        str(admin.id),
        str(recruiter.id),
        str(inactive.id),
    }
    assert str(outsider.id) not in response.text
    assert "hashed_password" not in response.text

    filtered = (await async_client.get("/api/v1/users?role=viewer&is_active=false")).json()
    assert [item["id"] for item in filtered["items"]] == [str(inactive.id)]
    searched = (await async_client.get("/api/v1/users", params={"search": recruiter.email})).json()
    assert [item["id"] for item in searched["items"]] == [str(recruiter.id)]
    assert (await async_client.get("/api/v1/users?search=%25")).json()["items"] == []
    events = committed_db.query(AuditEvent).filter(AuditEvent.action == "list_users").all()
    assert len(events) == 5
    assert all(event.org_id == admin.org_id and event.user_id == admin.id for event in events)


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [None, "recruiter", "viewer"])
async def test_user_management_requires_admin(
    role: str | None,
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    if role is not None:
        login_as(create_user(role))
    expected = 401 if role is None else 403
    target = uuid.uuid4()
    responses = [
        await async_client.get("/api/v1/users"),
        await async_client.post("/api/v1/users/invitations", json=INVITEE),
        await async_client.patch(f"/api/v1/users/{target}/role", json={"role": "admin"}),
        await async_client.post(f"/api/v1/users/{target}/deactivate"),
    ]
    assert [response.status_code for response in responses] == [expected] * 4
    assert committed_db.query(UserInvitation).count() == 0
    assert committed_db.query(AuditEvent).count() == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "recruiter", "viewer"])
async def test_invite_accept_and_login(
    role: str,
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
    caplog: pytest.LogCaptureFixture,
) -> None:
    admin = create_user()
    login_as(admin)
    created = await async_client.post(
        "/api/v1/users/invitations", json={"email": "Colleague@Example.com", "role": role}
    )
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    token = token_from(created.json())
    invitation = committed_db.get(UserInvitation, uuid.UUID(created.json()["id"]))
    assert invitation is not None
    assert invitation.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert invitation.token_hash != token
    assert invitation.email == "colleague@example.com"
    assert invitation.created_by == admin.id
    assert invitation.expires_at > datetime.now(UTC)
    assert invitation.expires_at <= datetime.now(UTC) + timedelta(
        hours=settings.USER_INVITE_EXPIRE_HOURS
    )
    assert committed_db.query(User).filter(User.email == invitation.email).count() == 0

    async_client.cookies.clear()
    accepted = await async_client.post(
        "/api/v1/auth/accept-invite", json={**REDEMPTION, "token": token}
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["role"] == role
    assert accepted.json()["org_id"] == str(admin.org_id)
    assert accepted.json()["email"] == invitation.email
    assert "hashed_password" not in accepted.text
    assert "token" not in accepted.json()
    user = committed_db.get(User, uuid.UUID(accepted.json()["id"]))
    assert user is not None and verify_password(PASSWORD, user.hashed_password)
    committed_db.refresh(invitation)
    assert invitation.used_at is not None and invitation.accepted_by == user.id

    reused = await async_client.post(
        "/api/v1/auth/accept-invite", json={**REDEMPTION, "token": token}
    )
    assert reused.status_code == 400
    assert committed_db.query(User).filter(User.email == invitation.email).count() == 1
    events = committed_db.query(AuditEvent).order_by(AuditEvent.created_at).all()
    assert [event.action for event in events] == ["invite_user", "accept_invitation"]
    assert events[0].user_id == admin.id
    assert events[1].user_id == user.id
    serialized_audit = json.dumps([event.details for event in events])
    assert token not in serialized_audit and PASSWORD not in serialized_audit
    assert token not in caplog.text and PASSWORD not in caplog.text

    login = await async_client.post(
        "/api/v1/auth/login", json={"email": invitation.email, "password": PASSWORD}
    )
    assert login.status_code == 200
    assert login.json()["user_id"] == str(user.id)


@pytest.mark.asyncio
async def test_expired_unknown_and_superseded_invites_are_rejected(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    admin = create_user()
    login_as(admin)
    first = (await async_client.post("/api/v1/users/invitations", json=INVITEE)).json()
    replacement = (
        await async_client.post("/api/v1/users/invitations", json={**INVITEE, "role": "viewer"})
    ).json()
    assert token_from(first) != token_from(replacement)
    old = committed_db.get(UserInvitation, uuid.UUID(first["id"]))
    assert old is not None and old.revoked_at is not None
    latest = committed_db.get(UserInvitation, uuid.UUID(replacement["id"]))
    assert latest is not None
    latest.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    committed_db.commit()
    async_client.cookies.clear()
    errors = []
    for token in (token_from(first), token_from(replacement), "not-a-real-token"):
        response = await async_client.post(
            "/api/v1/auth/accept-invite", json={**REDEMPTION, "token": token}
        )
        assert response.status_code == 400
        errors.append(response.json())
    assert errors[0] == errors[1] == errors[2]
    assert committed_db.query(User).filter(User.email == INVITEE["email"]).count() == 0
    assert (
        committed_db.query(AuditEvent).filter(AuditEvent.action == "accept_invitation").count() == 0
    )


@pytest.mark.asyncio
async def test_invitation_identity_cannot_be_overridden_and_invalid_input_does_not_consume_token(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    login_as(create_user())
    created = (await async_client.post("/api/v1/users/invitations", json=INVITEE)).json()
    token = token_from(created)
    for changes in (
        {"role": "admin"},
        {"org_id": str(uuid.uuid4())},
        {"email": "other@example.com"},
        {"password": "password"},
        {"full_name": "   "},
    ):
        response = await async_client.post(
            "/api/v1/auth/accept-invite", json={**REDEMPTION, "token": token, **changes}
        )
        assert response.status_code == 422
    invitation = committed_db.get(UserInvitation, uuid.UUID(created["id"]))
    assert invitation is not None and invitation.used_at is None
    valid = await async_client.post(
        "/api/v1/auth/accept-invite", json={**REDEMPTION, "token": token}
    )
    assert valid.status_code == 201


@pytest.mark.asyncio
async def test_duplicate_members_cannot_be_invited_even_when_inactive_or_email_case_differs(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    admin = create_user()
    colleague = create_user("viewer", org_id=admin.org_id)
    colleague.email = colleague.email.upper()
    colleague.is_active = False
    committed_db.commit()
    login_as(admin)
    response = await async_client.post(
        "/api/v1/users/invitations", json={"email": colleague.email.lower(), "role": "recruiter"}
    )
    assert response.status_code == 409
    assert committed_db.query(UserInvitation).count() == 0


@pytest.mark.asyncio
async def test_membership_changes_are_scoped_and_immediately_apply_to_existing_tokens(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    admin = create_user()
    colleague = create_user("admin", org_id=admin.org_id)
    outsider = create_user()
    login_as(admin)
    for target in (outsider.id, uuid.uuid4()):
        assert (
            await async_client.patch(f"/api/v1/users/{target}/role", json={"role": "viewer"})
        ).status_code == 404
        assert (await async_client.post(f"/api/v1/users/{target}/deactivate")).status_code == 404
    assert committed_db.query(AuditEvent).count() == 0

    # Save an admin cookie issued before the colleague's role changed.
    login_as(colleague)
    old_cookie = async_client.cookies[settings.ACCESS_COOKIE_NAME]
    login_as(admin)
    changed = await async_client.patch(
        f"/api/v1/users/{colleague.id}/role", json={"role": "viewer"}
    )
    assert changed.status_code == 200 and changed.json()["role"] == "viewer"
    async_client.cookies.set(settings.ACCESS_COOKIE_NAME, old_cookie)
    assert (await async_client.get("/api/v1/users")).status_code == 403

    login_as(admin)
    deactivated = await async_client.post(f"/api/v1/users/{colleague.id}/deactivate")
    assert deactivated.status_code == 200 and deactivated.json()["is_active"] is False
    # Repeating an already-applied change does not create a misleading second event.
    assert (await async_client.post(f"/api/v1/users/{colleague.id}/deactivate")).status_code == 200
    async_client.cookies.set(settings.ACCESS_COOKIE_NAME, old_cookie)
    assert (await async_client.get("/api/v1/auth/me")).status_code == 401
    async_client.cookies.set(
        settings.REFRESH_COOKIE_NAME, create_refresh_token(user_id=str(colleague.id))
    )
    assert (await async_client.post("/api/v1/auth/refresh")).status_code == 401
    events = committed_db.query(AuditEvent).order_by(AuditEvent.created_at).all()
    assert [event.action for event in events] == ["change_user_role", "deactivate_user"]
    assert all(event.user_id == admin.id and event.target_id == colleague.id for event in events)
    assert events[0].details == {"from": "admin", "to": "viewer"}


@pytest.mark.asyncio
async def test_last_admin_and_self_deactivation_are_protected(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    admin = create_user()
    inactive_admin = create_user("admin", org_id=admin.org_id)
    inactive_admin.is_active = False
    create_user("admin")  # An admin in a different workspace must not count.
    committed_db.commit()
    login_as(admin)
    for role in ("viewer", "recruiter"):
        response = await async_client.patch(f"/api/v1/users/{admin.id}/role", json={"role": role})
        assert response.status_code == 409
    assert (await async_client.post(f"/api/v1/users/{admin.id}/deactivate")).status_code == 409
    create_user("admin", org_id=admin.org_id)
    assert (await async_client.post(f"/api/v1/users/{admin.id}/deactivate")).status_code == 409
    assert (
        await async_client.patch(f"/api/v1/users/{admin.id}/role", json={"role": "recruiter"})
    ).status_code == 200
    assert (await async_client.get("/api/v1/users")).status_code == 403
    assert committed_db.query(AuditEvent).count() == 1


@pytest.mark.asyncio
async def test_invalid_roles_and_unexpected_user_fields_are_rejected(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    admin = create_user()
    login_as(admin)
    for payload in (
        {"role": "owner"},
        {"role": None},
        {"role": "viewer", "org_id": str(uuid.uuid4())},
    ):
        assert (
            await async_client.patch(f"/api/v1/users/{admin.id}/role", json=payload)
        ).status_code == 422
    for payload in (
        {"email": "bad"},
        {**INVITEE, "role": "owner"},
        {**INVITEE, "org_id": str(uuid.uuid4())},
    ):
        assert (
            await async_client.post("/api/v1/users/invitations", json=payload)
        ).status_code == 422


@pytest.mark.asyncio
async def test_invite_acceptance_rolls_back_if_audit_write_fails(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    login_as(create_user())
    created = (await async_client.post("/api/v1/users/invitations", json=INVITEE)).json()

    def fail_audit(**kwargs: object) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(user_service, "log_audit_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        await async_client.post(
            "/api/v1/auth/accept-invite", json={**REDEMPTION, "token": token_from(created)}
        )
    assert committed_db.query(User).filter(User.email == INVITEE["email"]).count() == 0
    invitation = committed_db.get(UserInvitation, uuid.UUID(created["id"]))
    assert invitation is not None and invitation.used_at is None


def test_concurrent_demotions_preserve_an_admin(
    db_engine: Engine, create_user: Callable[..., User]
) -> None:
    first = create_user()
    second = create_user("admin", org_id=first.org_id)
    barrier = threading.Barrier(2)

    def demote(user_id: uuid.UUID) -> int:
        with Session(db_engine) as db:
            actor = db.get(User, user_id)
            assert actor is not None
            barrier.wait(timeout=10)
            try:
                user_service.change_user_role(
                    db, actor, actor.id, UserRole.VIEWER, Request({"type": "http", "headers": []})
                )
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(demote, (first.id, second.id)))
    assert sorted(outcomes) == [200, 409]
    with Session(db_engine) as db:
        assert db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count() == 1
        assert db.query(AuditEvent).filter(AuditEvent.action == "change_user_role").count() == 1


def test_admin_deactivated_while_waiting_cannot_deactivate_another_admin(
    db_engine: Engine, create_user: Callable[..., User]
) -> None:
    first = create_user()
    second = create_user("admin", org_id=first.org_id)
    barrier = threading.Barrier(2)

    def deactivate(pair: tuple[uuid.UUID, uuid.UUID]) -> int:
        with Session(db_engine) as db:
            actor = db.get(User, pair[0])
            assert actor is not None
            barrier.wait(timeout=10)
            try:
                user_service.deactivate_user(
                    db, actor, pair[1], Request({"type": "http", "headers": []})
                )
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(deactivate, ((first.id, second.id), (second.id, first.id))))
    assert sorted(outcomes) == [200, 403]
    with Session(db_engine) as db:
        assert db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count() == 1
        assert db.query(AuditEvent).filter(AuditEvent.action == "deactivate_user").count() == 1


@pytest.mark.asyncio
async def test_concurrent_redemption_creates_only_one_account(
    db_engine: Engine,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    login_as(create_user())
    created = (await async_client.post("/api/v1/users/invitations", json=INVITEE)).json()
    token = token_from(created)
    barrier = threading.Barrier(2)

    def accept(_: int) -> int:
        with Session(db_engine) as db:
            barrier.wait(timeout=10)
            try:
                user_service.accept_invitation(
                    db,
                    AcceptInvitationRequest(token=SecretStr(token), **REDEMPTION),
                    Request({"type": "http", "headers": []}),
                )
                return 201
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(accept, range(2)))
    assert sorted(outcomes) == [201, 400]
    with Session(db_engine) as db:
        assert db.query(User).filter(User.email == INVITEE["email"]).count() == 1
        assert db.query(AuditEvent).filter(AuditEvent.action == "accept_invitation").count() == 1
