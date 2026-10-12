"""Jobs CRUD endpoint tests."""

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent
from app.models.user import User

JOBS_URL = "/api/v1/jobs"

JOB_PAYLOAD: dict[str, Any] = {
    "title": "Senior Python Backend Engineer",
    "department": "Engineering",
    "location": "Remote",
    "employment_type": "full_time",
    "description": "We are seeking a Senior Python Engineer.",
    "required_skills": ["Python", "FastAPI", "PostgreSQL"],
    "preferred_skills": ["Docker"],
    "min_experience_years": 4,
}


async def _create_job(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await client.post(JOBS_URL, json={**JOB_PAYLOAD, **overrides})
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


def _job_events(db: Session, job_id: str) -> list[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.target_entity == "job", AuditEvent.target_id == uuid.UUID(job_id))
        .order_by(AuditEvent.created_at)
        .all()
    )


@pytest.mark.asyncio
async def test_create_job(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A created job is a draft in the caller's org and writes an audit event."""
    admin = create_user("admin")
    login_as(admin)

    job = await _create_job(async_client)

    assert job["status"] == "draft"
    assert job["org_id"] == str(admin.org_id)
    assert {k: job[k] for k in JOB_PAYLOAD} == JOB_PAYLOAD
    assert job["created_at"] and job["updated_at"]

    (event,) = _job_events(committed_db, job["id"])
    assert event.action == "create_job"
    assert event.org_id == admin.org_id
    assert event.user_id == admin.id


@pytest.mark.asyncio
async def test_create_job_validation(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Missing or invalid fields are rejected, and only title/description are required."""
    login_as(create_user("recruiter"))

    for bad in ({"description": "No title"}, {**JOB_PAYLOAD, "min_experience_years": -1}):
        response = await async_client.post(JOBS_URL, json=bad)
        assert response.status_code == 422

    response = await async_client.post(JOBS_URL, json={"title": "Minimal", "description": "x"})
    assert response.status_code == 201
    job = response.json()
    assert job["department"] is None
    assert job["employment_type"] == "full_time"
    assert job["required_skills"] == []
    assert job["min_experience_years"] == 0


@pytest.mark.asyncio
async def test_jobs_require_authentication(async_client: AsyncClient) -> None:
    """Every jobs endpoint rejects anonymous callers."""
    job_url = f"{JOBS_URL}/{uuid.uuid4()}"
    responses = [
        await async_client.get(JOBS_URL),
        await async_client.post(JOBS_URL, json=JOB_PAYLOAD),
        await async_client.get(job_url),
        await async_client.patch(job_url, json={"title": "x"}),
        await async_client.patch(f"{job_url}/status", json={"status": "open"}),
        await async_client.post(f"{job_url}/archive"),
    ]
    assert [r.status_code for r in responses] == [401] * len(responses)


@pytest.mark.asyncio
async def test_viewer_is_read_only(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Viewers can list and get jobs but every write is 403 and leaves no trace."""
    recruiter = create_user("recruiter")
    viewer = create_user("viewer", org_id=recruiter.org_id)

    login_as(recruiter)
    job = await _create_job(async_client)
    job_url = f"{JOBS_URL}/{job['id']}"

    login_as(viewer)
    listing = await async_client.get(JOBS_URL)
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [job["id"]]
    assert (await async_client.get(job_url)).status_code == 200

    writes = [
        await async_client.post(JOBS_URL, json=JOB_PAYLOAD),
        await async_client.patch(job_url, json={"title": "Hacked"}),
        await async_client.patch(f"{job_url}/status", json={"status": "open"}),
        await async_client.post(f"{job_url}/archive"),
    ]
    assert [r.status_code for r in writes] == [403] * len(writes)

    after = (await async_client.get(job_url)).json()
    assert after == job
    assert [e.action for e in _job_events(committed_db, job["id"])] == ["create_job"]
    assert (await async_client.get(JOBS_URL)).json()["pagination"]["total_items"] == 1


@pytest.mark.asyncio
async def test_get_job_not_found(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Unknown IDs are 404 and malformed IDs are 422."""
    login_as(create_user("admin"))

    assert (await async_client.get(f"{JOBS_URL}/{uuid.uuid4()}")).status_code == 404
    assert (await async_client.get(f"{JOBS_URL}/not-a-uuid")).status_code == 422


@pytest.mark.asyncio
async def test_update_job(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """PATCH changes only the sent fields and audits which ones changed."""
    recruiter = create_user("recruiter")
    login_as(recruiter)
    job = await _create_job(async_client)
    job_url = f"{JOBS_URL}/{job['id']}"

    response = await async_client.patch(
        job_url, json={"title": "Staff Engineer", "location": None, "required_skills": ["Go"]}
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Staff Engineer"
    assert updated["location"] is None
    assert updated["required_skills"] == ["Go"]
    assert updated["department"] == job["department"]
    assert updated["description"] == job["description"]
    assert updated["status"] == "draft"
    assert updated["updated_at"] >= job["updated_at"]

    events = _job_events(committed_db, job["id"])
    assert [e.action for e in events] == ["create_job", "update_job"]
    assert events[1].details == {"changed_fields": ["location", "required_skills", "title"]}
    assert events[1].user_id == recruiter.id

    # Re-sending the same values is a no-op and is not audited.
    assert (await async_client.patch(job_url, json={"title": "Staff Engineer"})).status_code == 200
    assert len(_job_events(committed_db, job["id"])) == 2

    # Required columns cannot be nulled, and status is not editable through PATCH.
    assert (await async_client.patch(job_url, json={"title": None})).status_code == 422
    assert (await async_client.patch(job_url, json={"title": ""})).status_code == 422
    assert (await async_client.patch(job_url, json={"status": "open"})).json()["status"] == "draft"
    assert (await async_client.patch(f"{JOBS_URL}/{uuid.uuid4()}", json={})).status_code == 404


@pytest.mark.asyncio
async def test_status_changes(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Jobs move between draft, open and closed, with each change audited."""
    login_as(create_user("admin"))
    job = await _create_job(async_client)
    status_url = f"{JOBS_URL}/{job['id']}/status"

    for new_status in ("open", "closed", "draft"):
        response = await async_client.patch(status_url, json={"status": new_status})
        assert response.status_code == 200
        assert response.json()["status"] == new_status

    events = _job_events(committed_db, job["id"])[1:]
    assert [e.action for e in events] == ["change_job_status"] * 3
    assert [e.details for e in events] == [
        {"from": "draft", "to": "open"},
        {"from": "open", "to": "closed"},
        {"from": "closed", "to": "draft"},
    ]

    # Same status again: nothing changes and nothing is audited.
    assert (await async_client.patch(status_url, json={"status": "draft"})).status_code == 200
    assert len(_job_events(committed_db, job["id"])) == 4

    for invalid in ("archived", "paused", "bogus"):
        assert (await async_client.patch(status_url, json={"status": invalid})).status_code == 422
    missing_url = f"{JOBS_URL}/{uuid.uuid4()}/status"
    assert (await async_client.patch(missing_url, json={"status": "open"})).status_code == 404


@pytest.mark.asyncio
async def test_archive_job(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Archiving is audited, idempotent, and hides the job from the default list."""
    login_as(create_user("recruiter"))
    kept = await _create_job(async_client, title="Kept")
    archived = await _create_job(async_client, title="Archived")
    archive_url = f"{JOBS_URL}/{archived['id']}/archive"

    response = await async_client.post(archive_url)
    assert response.status_code == 200
    assert response.json()["status"] == "archived"
    assert (await async_client.post(archive_url)).status_code == 200

    events = _job_events(committed_db, archived["id"])
    assert [e.action for e in events] == ["create_job", "archive_job"]
    assert events[1].details == {"from": "draft", "to": "archived"}

    default_list = (await async_client.get(JOBS_URL)).json()
    assert [item["id"] for item in default_list["items"]] == [kept["id"]]
    archived_list = (await async_client.get(JOBS_URL, params={"status": "archived"})).json()
    assert [item["id"] for item in archived_list["items"]] == [archived["id"]]

    # Still readable directly.
    assert (await async_client.get(f"{JOBS_URL}/{archived['id']}")).json()["status"] == "archived"
    assert (await async_client.post(f"{JOBS_URL}/{uuid.uuid4()}/archive")).status_code == 404


@pytest.mark.asyncio
async def test_list_jobs_filter_search_sort_pagination(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """The list supports status filter, search, sorting and the spec's pagination envelope."""
    login_as(create_user("admin"))

    alpha = await _create_job(async_client, title="Alpha Engineer", department="Platform")
    bravo = await _create_job(async_client, title="Bravo Designer", department="Design")
    charlie = await _create_job(
        async_client, title="Charlie 100% Remote", department=None, location="Bucharest"
    )
    await async_client.patch(f"{JOBS_URL}/{bravo['id']}/status", json={"status": "open"})

    async def titles(**params: Any) -> list[str]:
        response = await async_client.get(JOBS_URL, params=params)
        assert response.status_code == 200, response.text
        return [item["title"] for item in response.json()["items"]]

    # Default order is newest first.
    assert await titles() == [charlie["title"], bravo["title"], alpha["title"]]

    # Sorting.
    by_title = [alpha["title"], bravo["title"], charlie["title"]]
    assert await titles(sort_by="title", sort_order="asc") == by_title
    assert await titles(sort_by="title", sort_order="desc") == by_title[::-1]
    assert await titles(sort_by="created_at", sort_order="asc") == by_title
    assert (await titles(sort_by="status", sort_order="desc"))[0] == bravo["title"]
    assert (await async_client.get(JOBS_URL, params={"sort_by": "embedding"})).status_code == 422

    # Status filter.
    assert await titles(status="open") == [bravo["title"]]
    assert await titles(status="closed") == []
    assert (await async_client.get(JOBS_URL, params={"status": "bogus"})).status_code == 422

    # Search: case-insensitive over title, department and location; wildcards are literal.
    assert await titles(search="ENGINEER") == [alpha["title"]]
    assert await titles(search="design") == [bravo["title"]]
    assert await titles(search="bucharest") == [charlie["title"]]
    assert await titles(search="100%") == [charlie["title"]]
    assert await titles(search="%") == [charlie["title"]]
    assert await titles(search="_") == []
    assert await titles(search="nothing-matches") == []
    assert await titles(search="e", status="open") == [bravo["title"]]

    # Pagination.
    page1 = (await async_client.get(JOBS_URL, params={"per_page": 2})).json()
    assert [item["title"] for item in page1["items"]] == [charlie["title"], bravo["title"]]
    assert page1["pagination"] == {
        "page": 1,
        "per_page": 2,
        "total_items": 3,
        "total_pages": 2,
        "has_next": True,
        "has_prev": False,
    }
    page2 = (await async_client.get(JOBS_URL, params={"per_page": 2, "page": 2})).json()
    assert [item["title"] for item in page2["items"]] == [alpha["title"]]
    assert page2["pagination"]["has_next"] is False
    assert page2["pagination"]["has_prev"] is True

    empty = (await async_client.get(JOBS_URL, params={"search": "nothing-matches"})).json()
    assert empty["pagination"]["total_items"] == 0
    assert empty["pagination"]["total_pages"] == 0
    assert empty["pagination"]["has_next"] is False

    for bad in ({"page": 0}, {"per_page": 0}, {"per_page": 101}):
        assert (await async_client.get(JOBS_URL, params=bad)).status_code == 422
