"""Candidates CRUD endpoint tests."""

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.application_stage_history import ApplicationStageHistory
from app.models.audit_event import AuditEvent
from app.models.candidate import Candidate
from app.models.user import User

CANDIDATES_URL = "/api/v1/candidates"
JOBS_URL = "/api/v1/jobs"
APPLICATIONS_URL = "/api/v1/applications"

CANDIDATE_PAYLOAD: dict[str, Any] = {
    "full_name": "Alex Mercer",
    "email": "alex.mercer@example.com",
    "phone": "+1-555-0199",
    "location": "Bucharest",
}
CONSENT_AT = "2026-10-01T09:00:00Z"


async def _create_candidate(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await client.post(CANDIDATES_URL, json={**CANDIDATE_PAYLOAD, **overrides})
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


def _candidate_events(db: Session, candidate_id: str) -> list[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(
            AuditEvent.target_entity == "candidate",
            AuditEvent.target_id == uuid.UUID(candidate_id),
        )
        .order_by(AuditEvent.created_at)
        .all()
    )


@pytest.mark.asyncio
async def test_create_candidate(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A candidate lands in the caller's org without consent and is audited without PII."""
    recruiter = create_user("recruiter")
    login_as(recruiter)

    candidate = await _create_candidate(async_client)

    assert candidate["org_id"] == str(recruiter.org_id)
    assert {k: candidate[k] for k in CANDIDATE_PAYLOAD} == CANDIDATE_PAYLOAD
    assert candidate["consent_given_at"] is None
    assert candidate["parsed_data"] == {}
    assert candidate["cv_file_path"] is None
    assert candidate["created_at"] and candidate["updated_at"]

    (event,) = _candidate_events(committed_db, candidate["id"])
    assert event.action == "create_candidate"
    assert event.org_id == recruiter.org_id
    assert event.user_id == recruiter.id
    assert event.details == {"consent_given": False}


@pytest.mark.asyncio
async def test_create_candidate_with_consent_and_minimal_fields(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Only name and email are required; consent_given_at is stored when sent."""
    login_as(create_user("admin"))

    candidate = await _create_candidate(async_client, consent_given_at=CONSENT_AT)
    assert datetime.fromisoformat(candidate["consent_given_at"]) == datetime.fromisoformat(
        CONSENT_AT
    )
    (event,) = _candidate_events(committed_db, candidate["id"])
    assert event.details == {"consent_given": True}

    response = await async_client.post(
        CANDIDATES_URL, json={"full_name": "Minimal", "email": "Minimal@Example.com"}
    )
    assert response.status_code == 201
    minimal = response.json()
    assert minimal["email"] == "minimal@example.com"
    assert minimal["phone"] is None
    assert minimal["location"] is None
    assert minimal["consent_given_at"] is None


@pytest.mark.asyncio
async def test_create_candidate_validation_and_duplicates(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Bad payloads are 422 and a repeated email in the same org is 409."""
    login_as(create_user("recruiter"))

    bad_payloads: list[dict[str, Any]] = [
        {"email": "no-name@example.com"},
        {"full_name": "No Email"},
        {**CANDIDATE_PAYLOAD, "full_name": ""},
        {**CANDIDATE_PAYLOAD, "email": "not-an-email"},
        {**CANDIDATE_PAYLOAD, "consent_given_at": "yesterday"},
        {**CANDIDATE_PAYLOAD, "consent_given_at": "2026-10-01T09:00:00"},  # no timezone
    ]
    for bad in bad_payloads:
        assert (await async_client.post(CANDIDATES_URL, json=bad)).status_code == 422, bad

    await _create_candidate(async_client)
    for email in (CANDIDATE_PAYLOAD["email"], CANDIDATE_PAYLOAD["email"].upper()):
        response = await async_client.post(
            CANDIDATES_URL, json={**CANDIDATE_PAYLOAD, "email": email}
        )
        assert response.status_code == 409
    assert (await async_client.get(CANDIDATES_URL)).json()["pagination"]["total_items"] == 1


@pytest.mark.asyncio
async def test_candidates_require_authentication(async_client: AsyncClient) -> None:
    """Every candidates endpoint rejects anonymous callers."""
    candidate_url = f"{CANDIDATES_URL}/{uuid.uuid4()}"
    responses = [
        await async_client.get(CANDIDATES_URL),
        await async_client.post(CANDIDATES_URL, json=CANDIDATE_PAYLOAD),
        await async_client.get(candidate_url),
        await async_client.patch(candidate_url, json={"full_name": "x"}),
        await async_client.delete(candidate_url),
    ]
    assert [r.status_code for r in responses] == [401] * len(responses)


@pytest.mark.asyncio
async def test_candidate_roles(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Viewers are read-only, and only admins may delete."""
    recruiter = create_user("recruiter")
    viewer = create_user("viewer", org_id=recruiter.org_id)

    login_as(recruiter)
    candidate = await _create_candidate(async_client)
    candidate_url = f"{CANDIDATES_URL}/{candidate['id']}"
    assert (await async_client.delete(candidate_url)).status_code == 403

    login_as(viewer)
    listing = await async_client.get(CANDIDATES_URL)
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [candidate["id"]]
    assert (await async_client.get(candidate_url)).status_code == 200

    writes = [
        await async_client.post(CANDIDATES_URL, json={**CANDIDATE_PAYLOAD, "email": "v@x.io"}),
        await async_client.patch(candidate_url, json={"full_name": "Hacked"}),
        await async_client.delete(candidate_url),
    ]
    assert [r.status_code for r in writes] == [403] * len(writes)

    assert (await async_client.get(candidate_url)).json() == candidate
    assert [e.action for e in _candidate_events(committed_db, candidate["id"])] == [
        "create_candidate"
    ]
    assert (await async_client.get(CANDIDATES_URL)).json()["pagination"]["total_items"] == 1


@pytest.mark.asyncio
async def test_get_candidate_not_found(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Unknown IDs are 404 and malformed IDs are 422."""
    login_as(create_user("admin"))

    assert (await async_client.get(f"{CANDIDATES_URL}/{uuid.uuid4()}")).status_code == 404
    assert (await async_client.get(f"{CANDIDATES_URL}/not-a-uuid")).status_code == 422


@pytest.mark.asyncio
async def test_update_candidate(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """PATCH changes only the sent fields, can set and clear consent, and audits field names."""
    recruiter = create_user("recruiter")
    login_as(recruiter)
    candidate = await _create_candidate(async_client)
    other = await _create_candidate(async_client, email="other@example.com")
    candidate_url = f"{CANDIDATES_URL}/{candidate['id']}"

    response = await async_client.patch(
        candidate_url,
        json={"full_name": "Alexander Mercer", "phone": None, "consent_given_at": CONSENT_AT},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["full_name"] == "Alexander Mercer"
    assert updated["phone"] is None
    assert datetime.fromisoformat(updated["consent_given_at"]) == datetime.fromisoformat(CONSENT_AT)
    assert updated["email"] == candidate["email"]
    assert updated["location"] == candidate["location"]
    assert updated["updated_at"] >= candidate["updated_at"]

    events = _candidate_events(committed_db, candidate["id"])
    assert [e.action for e in events] == ["create_candidate", "update_candidate"]
    assert events[1].details == {"changed_fields": ["consent_given_at", "full_name", "phone"]}
    assert events[1].user_id == recruiter.id

    # Re-sending the same values is a no-op and is not audited.
    same = await async_client.patch(
        candidate_url, json={"full_name": "Alexander Mercer", "consent_given_at": CONSENT_AT}
    )
    assert same.status_code == 200
    assert len(_candidate_events(committed_db, candidate["id"])) == 2

    # Consent can be withdrawn by clearing the timestamp.
    cleared = await async_client.patch(candidate_url, json={"consent_given_at": None})
    assert cleared.json()["consent_given_at"] is None

    # Required columns cannot be nulled, and an email already in use is a conflict.
    assert (await async_client.patch(candidate_url, json={"full_name": None})).status_code == 422
    assert (await async_client.patch(candidate_url, json={"email": None})).status_code == 422
    conflict = await async_client.patch(candidate_url, json={"email": other["email"].upper()})
    assert conflict.status_code == 409
    assert (await async_client.get(candidate_url)).json()["email"] == candidate["email"]
    assert (
        await async_client.patch(f"{CANDIDATES_URL}/{uuid.uuid4()}", json={})
    ).status_code == 404


@pytest.mark.asyncio
async def test_list_candidates_search_sort_pagination(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """The list supports search, sorting and the spec's pagination envelope."""
    login_as(create_user("admin"))

    alice = await _create_candidate(async_client, full_name="Alice Ionescu", email="zed@a.io")
    bob = await _create_candidate(async_client, full_name="Bob Popescu", email="bob@b.io")
    carol = await _create_candidate(async_client, full_name="Carol 100%", email="carol@c.io")

    async def names(**params: Any) -> list[str]:
        response = await async_client.get(CANDIDATES_URL, params=params)
        assert response.status_code == 200, response.text
        return [item["full_name"] for item in response.json()["items"]]

    # Default order is newest first.
    assert await names() == [carol["full_name"], bob["full_name"], alice["full_name"]]

    by_name = [alice["full_name"], bob["full_name"], carol["full_name"]]
    assert await names(sort_by="full_name", sort_order="asc") == by_name
    assert await names(sort_by="full_name", sort_order="desc") == by_name[::-1]
    assert (await names(sort_by="email", sort_order="asc"))[-1] == alice["full_name"]
    assert (await async_client.get(CANDIDATES_URL, params={"sort_by": "phone"})).status_code == 422

    # Search: case-insensitive over name and email; wildcards are literal.
    assert await names(search="IONESCU") == [alice["full_name"]]
    assert await names(search="bob@b") == [bob["full_name"]]
    assert await names(search="100%") == [carol["full_name"]]
    assert await names(search="_") == []
    assert await names(search="nothing-matches") == []

    page1 = (await async_client.get(CANDIDATES_URL, params={"per_page": 2})).json()
    assert [item["full_name"] for item in page1["items"]] == [carol["full_name"], bob["full_name"]]
    assert page1["pagination"] == {
        "page": 1,
        "per_page": 2,
        "total_items": 3,
        "total_pages": 2,
        "has_next": True,
        "has_prev": False,
    }
    page2 = (await async_client.get(CANDIDATES_URL, params={"per_page": 2, "page": 2})).json()
    assert [item["full_name"] for item in page2["items"]] == [alice["full_name"]]

    for bad in ({"page": 0}, {"per_page": 0}, {"per_page": 101}):
        assert (await async_client.get(CANDIDATES_URL, params=bad)).status_code == 422


@pytest.mark.asyncio
async def test_delete_candidate(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Deleting removes the candidate, their applications and stage history, and is audited."""
    admin = create_user("admin")
    login_as(admin)
    candidate = await _create_candidate(async_client)
    kept = await _create_candidate(async_client, email="kept@example.com")
    job = (await async_client.post(JOBS_URL, json={"title": "Role", "description": "x"})).json()
    for person in (candidate, kept):
        created = await async_client.post(
            APPLICATIONS_URL, json={"job_id": job["id"], "candidate_id": person["id"]}
        )
        assert created.status_code == 201, created.text
    candidate_url = f"{CANDIDATES_URL}/{candidate['id']}"

    response = await async_client.delete(candidate_url)
    assert response.status_code == 204
    assert response.content == b""
    assert (await async_client.get(candidate_url)).status_code == 404
    assert (await async_client.delete(candidate_url)).status_code == 404

    # Only the other candidate's rows are left.
    kept_id = uuid.UUID(kept["id"])
    assert [c.id for c in committed_db.query(Candidate).all()] == [kept_id]
    (application,) = committed_db.query(Application).all()
    assert application.candidate_id == kept_id
    (history,) = committed_db.query(ApplicationStageHistory).all()
    assert history.application_id == application.id
    assert (await async_client.get(f"{JOBS_URL}/{job['id']}")).status_code == 200

    events = _candidate_events(committed_db, candidate["id"])
    assert [e.action for e in events] == ["create_candidate", "delete_candidate"]
    assert events[1].user_id == admin.id
    assert events[1].details == {"applications_deleted": 1, "cv_files_deleted": 0}
