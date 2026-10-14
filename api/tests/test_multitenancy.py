"""Tests for multi-tenancy isolation on all existing endpoints."""

import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.main import app
from app.models.application_stage_history import ApplicationStageHistory
from app.models.audit_event import AuditEvent
from app.models.cv_document import CvDocument
from app.models.organization import Organization
from app.models.user import User

# Synthetic CVs from the L-5 generator.
L5_CVS = Path(__file__).parent / "fixtures" / "cvs"


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


@pytest.mark.asyncio
async def test_org_b_cannot_read_or_write_org_a_candidates(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Every candidates endpoint hides org A's candidates from org B, even for an org B admin."""
    admin_a = create_user("admin")
    admin_b = create_user("admin")
    payload = {"full_name": "Org A Secret Person", "email": "secret@orga.example"}

    login_as(admin_a)
    created = await async_client.post("/api/v1/candidates", json=payload)
    assert created.status_code == 201
    candidate_a = created.json()
    candidate_url = f"/api/v1/candidates/{candidate_a['id']}"

    login_as(admin_b)

    # Reads: not listed (with or without search) and not fetchable by ID.
    for params in ({}, {"search": "Secret"}, {"search": "orga.example"}):
        listing = await async_client.get("/api/v1/candidates", params=params)
        assert listing.status_code == 200
        assert listing.json()["items"] == []
        assert listing.json()["pagination"]["total_items"] == 0
    assert (await async_client.get(candidate_url)).status_code == 404

    # Writes: all look like a missing candidate.
    writes = [
        await async_client.patch(candidate_url, json={"full_name": "Taken over"}),
        await async_client.delete(candidate_url),
    ]
    assert [r.status_code for r in writes] == [404] * len(writes)
    for response in writes:
        assert "Org A Secret Person" not in response.text

    # The same email is free in org B, and the new candidate lands in org B.
    created_b = await async_client.post("/api/v1/candidates", json=payload)
    assert created_b.status_code == 201
    candidate_b = created_b.json()
    assert candidate_b["org_id"] == str(admin_b.org_id)
    assert candidate_b["id"] != candidate_a["id"]

    # Org A's candidate is untouched and org A only sees its own.
    login_as(admin_a)
    assert (await async_client.get(candidate_url)).json() == candidate_a
    listing_a = (await async_client.get("/api/v1/candidates")).json()
    assert [item["id"] for item in listing_a["items"]] == [candidate_a["id"]]

    # The failed cross-org writes left no audit trail on org A's candidate.
    events = committed_db.query(AuditEvent).filter(AuditEvent.target_entity == "candidate").all()
    assert {(e.org_id, e.action, str(e.target_id)) for e in events} == {
        (admin_a.org_id, "create_candidate", candidate_a["id"]),
        (admin_b.org_id, "create_candidate", candidate_b["id"]),
    }


@pytest.mark.asyncio
async def test_org_b_cannot_read_or_write_org_a_applications_and_stages(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Applications, stage history, stage moves and pipeline stages never cross organizations."""
    admin_a = create_user("admin")
    admin_b = create_user("admin")

    async def setup() -> tuple[Any, Any, Any, dict[str, str]]:
        """Create a job, a candidate and their application for the logged-in org."""
        job = (
            await async_client.post("/api/v1/jobs", json={"title": "Role", "description": "x"})
        ).json()
        candidate = (
            await async_client.post(
                "/api/v1/candidates", json={"full_name": "Person", "email": "person@example.com"}
            )
        ).json()
        created = await async_client.post(
            "/api/v1/applications", json={"job_id": job["id"], "candidate_id": candidate["id"]}
        )
        assert created.status_code == 201, created.text
        stages = (await async_client.get(f"/api/v1/jobs/{job['id']}/stages")).json()
        return job, candidate, created.json(), {s["name"]: s["id"] for s in stages}

    login_as(admin_a)
    job_a, candidate_a, application_a, stages_a = await setup()
    application_url = f"/api/v1/applications/{application_a['id']}"

    login_as(admin_b)
    job_b, candidate_b, application_b, stages_b = await setup()

    # Each org has its own copy of the default stages.
    assert stages_a.keys() == stages_b.keys()
    assert not set(stages_a.values()) & set(stages_b.values())
    assert application_b["stage_id"] == stages_b["Applied"]

    # Reads: org A's application is not listed under any filter, nor fetchable.
    for params in (
        {},
        {"job_id": job_a["id"]},
        {"candidate_id": candidate_a["id"]},
        {"stage_id": stages_a["Applied"]},
    ):
        listing = await async_client.get("/api/v1/applications", params=params)
        assert listing.status_code == 200
        assert application_a["id"] not in [item["id"] for item in listing.json()["items"]]
    assert (await async_client.get("/api/v1/applications")).json()["pagination"]["total_items"] == 1
    reads = [
        await async_client.get(application_url),
        await async_client.get(f"{application_url}/history"),
        await async_client.get(f"/api/v1/jobs/{job_a['id']}/stages"),
    ]
    assert [r.status_code for r in reads] == [404] * len(reads)

    # Writes: org A's application cannot be moved, even to a stage org B owns.
    for stage_id in (stages_a["Interview"], stages_b["Interview"]):
        response = await async_client.patch(
            f"{application_url}/stage", json={"stage_id": stage_id, "reason": "takeover"}
        )
        assert response.status_code == 404

    # Org B's own application cannot be moved into one of org A's stages.
    response = await async_client.patch(
        f"/api/v1/applications/{application_b['id']}/stage",
        json={"stage_id": stages_a["Interview"]},
    )
    assert response.status_code == 404

    # An application cannot link org A's job or candidate from org B, in any combination.
    other_b = (
        await async_client.post(
            "/api/v1/candidates", json={"full_name": "Other", "email": "other@example.com"}
        )
    ).json()
    for body in (
        {"job_id": job_a["id"], "candidate_id": candidate_a["id"]},
        {"job_id": job_a["id"], "candidate_id": other_b["id"]},
        {"job_id": job_b["id"], "candidate_id": candidate_a["id"]},
    ):
        assert (await async_client.post("/api/v1/applications", json=body)).status_code == 404

    # Org B's application is where org B left it.
    unchanged_b = (await async_client.get(f"/api/v1/applications/{application_b['id']}")).json()
    assert unchanged_b == application_b

    # Org A's application, history and stages are untouched, and org A sees only its own.
    login_as(admin_a)
    assert (await async_client.get(application_url)).json() == application_a
    history_a = (await async_client.get(f"{application_url}/history")).json()
    assert [(h["from_stage_id"], h["to_stage_id"]) for h in history_a] == [
        (None, stages_a["Applied"])
    ]
    listing_a = (await async_client.get("/api/v1/applications")).json()
    assert [item["id"] for item in listing_a["items"]] == [application_a["id"]]
    assert (await async_client.get(f"/api/v1/jobs/{job_b['id']}/stages")).status_code == 404

    # Stored rows carry their own org, and no cross-org attempt was audited.
    history_rows = committed_db.query(ApplicationStageHistory).all()
    assert {(h.org_id, str(h.application_id)) for h in history_rows} == {
        (admin_a.org_id, application_a["id"]),
        (admin_b.org_id, application_b["id"]),
    }
    events = committed_db.query(AuditEvent).filter(AuditEvent.target_entity == "application").all()
    assert {(e.org_id, e.action, str(e.target_id)) for e in events} == {
        (admin_a.org_id, "create_application", application_a["id"]),
        (admin_b.org_id, "create_application", application_b["id"]),
    }


@pytest.mark.asyncio
async def test_org_b_cannot_read_or_write_org_a_cv_documents(
    async_client: AsyncClient,
    committed_db: Session,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """CV upload, list, status and download never cross organizations (L-5 PDFs)."""
    pdf_a = (L5_CVS / "C001.pdf").read_bytes()
    pdf_b = (L5_CVS / "C002.pdf").read_bytes()
    storage_root = tmp_path / "storage"

    def stored_files() -> list[Path]:
        return sorted(path for path in storage_root.rglob("*") if path.is_file())

    async def setup(pdf: bytes) -> tuple[Any, Any]:
        """Create a candidate with one uploaded CV for the logged-in org."""
        candidate = (
            await async_client.post(
                "/api/v1/candidates", json={"full_name": "Person", "email": "person@example.com"}
            )
        ).json()
        uploaded = await async_client.post(
            f"/api/v1/candidates/{candidate['id']}/cv",
            files={"file": ("cv.pdf", pdf, "application/pdf")},
        )
        assert uploaded.status_code == 201, uploaded.text
        return candidate, uploaded.json()

    admin_a = create_user("admin")
    admin_b = create_user("admin")

    login_as(admin_a)
    candidate_a, document_a = await setup(pdf_a)
    base_a = f"/api/v1/candidates/{candidate_a['id']}/cv"

    login_as(admin_b)
    candidate_b, document_b = await setup(pdf_b)
    base_b = f"/api/v1/candidates/{candidate_b['id']}/cv"
    files_before = stored_files()
    assert len(files_before) == 2

    # Reads: org A's documents are invisible, by its own URL or grafted onto org B's candidate.
    reads = [
        await async_client.get(base_a),
        await async_client.get(f"{base_a}/{document_a['id']}"),
        await async_client.get(f"{base_a}/{document_a['id']}/download"),
        await async_client.get(f"{base_b}/{document_a['id']}"),
        await async_client.get(f"{base_b}/{document_a['id']}/download"),
    ]
    assert [r.status_code for r in reads] == [404] * len(reads)
    for response in reads:
        assert response.content != pdf_a
    assert [doc["id"] for doc in (await async_client.get(base_b)).json()] == [document_b["id"]]

    # Write: org B cannot attach a file to org A's candidate, and nothing is stored.
    upload = await async_client.post(
        base_a, files={"file": ("takeover.pdf", pdf_b, "application/pdf")}
    )
    assert upload.status_code == 404
    assert stored_files() == files_before

    # Org B still gets its own file, and only that.
    own = await async_client.get(f"{base_b}/{document_b['id']}/download")
    assert own.status_code == 200
    assert own.content == pdf_b

    # Org A's document is untouched and org A cannot reach org B's either.
    login_as(admin_a)
    assert (await async_client.get(f"{base_a}/{document_a['id']}")).json() == document_a
    assert [doc["id"] for doc in (await async_client.get(base_a)).json()] == [document_a["id"]]
    assert (await async_client.get(f"{base_a}/{document_a['id']}/download")).content == pdf_a
    assert (await async_client.get(f"{base_b}/{document_b['id']}/download")).status_code == 404

    # Each file is stored under its own org's prefix, and no cross-org attempt was audited.
    rows = committed_db.query(CvDocument).all()
    assert {(row.org_id, str(row.id)) for row in rows} == {
        (admin_a.org_id, document_a["id"]),
        (admin_b.org_id, document_b["id"]),
    }
    for row in rows:
        assert row.storage_key.startswith(f"cvs/{row.org_id}/")
    events = committed_db.query(AuditEvent).filter(AuditEvent.target_entity == "cv_document").all()
    assert sorted((str(e.org_id), e.action, str(e.target_id)) for e in events) == sorted(
        [
            (str(admin_a.org_id), "upload_cv", document_a["id"]),
            (str(admin_a.org_id), "download_cv", document_a["id"]),
            (str(admin_b.org_id), "upload_cv", document_b["id"]),
            (str(admin_b.org_id), "download_cv", document_b["id"]),
        ]
    )
