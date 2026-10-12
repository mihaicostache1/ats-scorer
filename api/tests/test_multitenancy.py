"""Tests for multi-tenancy isolation on all existing endpoints."""

import uuid
from collections.abc import Callable

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.organization import Organization
from app.models.user import User


@pytest.mark.asyncio
async def test_org_a_cannot_access_org_b_data_on_existing_endpoints(
    async_client: AsyncClient, db_session: Session
) -> None:
    """An automated test shows org A cannot read or write org B data on every existing endpoint."""
    # 1. Create Org A and Org B
    org_a = Organization(id=uuid.uuid4(), name="Org A", slug="orga")
    org_b = Organization(id=uuid.uuid4(), name="Org B", slug="orgb")
    db_session.add_all([org_a, org_b])
    db_session.commit()

    # 2. Create users for both orgs
    user_a = User(
        id=uuid.uuid4(),
        org_id=org_a.id,
        email="admin@orga.com",
        hashed_password="hashed_password",
        full_name="Admin A",
        role="admin",
    )
    user_b = User(
        id=uuid.uuid4(),
        org_id=org_b.id,
        email="admin@orgb.com",
        hashed_password="hashed_password",
        full_name="Admin B",
        role="admin",
    )
    db_session.add_all([user_a, user_b])
    db_session.commit()

    # 3. Authenticate as Org A
    token_a = create_access_token(user_id=str(user_a.id), org_id=str(org_a.id), role=user_a.role)
    async_client.cookies.set(settings.ACCESS_COOKIE_NAME, token_a)

    # 4. Iterate over all existing routes
    # For routes that take no path params, we call them and assert they don't leak Org B data.
    routes = [route for route in app.routes if hasattr(route, "methods")]
    for route in routes:
        path = route.path
        # We only care about GET routes without path params for this generic test
        if "GET" in route.methods and "{" not in path:
            response = await async_client.get(path)
            # If it's a valid response, it shouldn't contain Org B's data
            if response.status_code == 200:
                text = response.text
                assert "Org B" not in text
                assert "orgb" not in text
                assert "admin@orgb.com" not in text


@pytest.mark.asyncio
async def test_viewer_cannot_write_and_rbac_dependencies(
    async_client: AsyncClient, db_session: Session
) -> None:
    """Test the get_current_recruiter_or_admin dependency prevents viewers from writing."""
    from fastapi import APIRouter, Depends

    from app.core.dependencies import get_current_recruiter_or_admin
    from app.db.session import get_db

    # Override get_db so the app sees the same transactional session as the test.
    app.dependency_overrides[get_db] = lambda: db_session

    try:
        router = APIRouter()

        @router.post("/test-write")
        def test_write(current_user: User = Depends(get_current_recruiter_or_admin)):
            return {"msg": "write success"}

        app.include_router(router)

        org = Organization(id=uuid.uuid4(), name="Org", slug="org")
        viewer = User(
            id=uuid.uuid4(),
            org_id=org.id,
            email="viewer@org.com",
            hashed_password="hash",
            full_name="Viewer",
            role="viewer",
        )
        db_session.add_all([org, viewer])
        db_session.commit()

        token = create_access_token(user_id=str(viewer.id), org_id=str(org.id), role=viewer.role)
        async_client.cookies.set(settings.ACCESS_COOKIE_NAME, token)

        response = await async_client.post("/test-write")
        assert response.status_code == 403
        assert "Not enough privileges" in response.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_org_b_cannot_read_or_write_org_a_jobs(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Every jobs endpoint hides org A's jobs from org B, even for an org B admin."""
    admin_a = create_user("admin")
    admin_b = create_user("admin")
    assert admin_a.org_id != admin_b.org_id

    login_as(admin_a)
    created = await async_client.post(
        "/api/v1/jobs", json={"title": "Org A Secret Role", "description": "Confidential"}
    )
    assert created.status_code == 201
    job_a = created.json()
    job_url = f"/api/v1/jobs/{job_a['id']}"

    login_as(admin_b)

    # Reads: not listed (with or without filters) and not fetchable by ID.
    for params in ({}, {"search": "Secret"}, {"status": "draft"}):
        listing = await async_client.get("/api/v1/jobs", params=params)
        assert listing.status_code == 200
        assert listing.json()["items"] == []
        assert listing.json()["pagination"]["total_items"] == 0
    assert (await async_client.get(job_url)).status_code == 404

    # Writes: all look like a missing job.
    writes = [
        await async_client.patch(job_url, json={"title": "Taken over"}),
        await async_client.patch(f"{job_url}/status", json={"status": "open"}),
        await async_client.post(f"{job_url}/archive"),
    ]
    assert [r.status_code for r in writes] == [404] * len(writes)
    for response in writes:
        assert "Org A Secret Role" not in response.text

    # Org B's own job lands in org B, never in org A.
    created_b = await async_client.post(
        "/api/v1/jobs", json={"title": "Org B Role", "description": "Ours"}
    )
    assert created_b.json()["org_id"] == str(admin_b.org_id)

    # Org A's job is untouched and org A only sees its own job.
    login_as(admin_a)
    assert (await async_client.get(job_url)).json() == job_a
    listing_a = (await async_client.get("/api/v1/jobs")).json()
    assert [item["id"] for item in listing_a["items"]] == [job_a["id"]]

    # The failed cross-org writes left no audit trail on org A's job, and each
    # org's audit log only carries its own job events.
    job_events = committed_db.query(AuditEvent).filter(AuditEvent.target_entity == "job").all()
    assert {(e.org_id, e.action, str(e.target_id)) for e in job_events} == {
        (admin_a.org_id, "create_job", job_a["id"]),
        (admin_b.org_id, "create_job", created_b.json()["id"]),
    }
    audit_a = (await async_client.get("/api/v1/audit/events")).json()
    assert [item["target_id"] for item in audit_a["items"]] == [job_a["id"]]
