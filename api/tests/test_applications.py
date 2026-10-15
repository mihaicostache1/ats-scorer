"""Applications, pipeline stages and stage-move endpoint tests."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent
from app.models.pipeline_stage import PipelineStage
from app.models.score import Score
from app.models.user import User

APPLICATIONS_URL = "/api/v1/applications"
CANDIDATES_URL = "/api/v1/candidates"
JOBS_URL = "/api/v1/jobs"

DEFAULT_STAGE_NAMES = ["Applied", "Shortlisted", "Interview", "Offer", "Hired", "Rejected"]


async def _create_job(client: AsyncClient, title: str = "Backend Engineer") -> dict[str, Any]:
    response = await client.post(JOBS_URL, json={"title": title, "description": "A role."})
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def _create_candidate(client: AsyncClient, name: str = "Alex") -> dict[str, Any]:
    payload = {"full_name": name, "email": f"{name.lower()}-{uuid.uuid4().hex[:6]}@example.com"}
    response = await client.post(CANDIDATES_URL, json=payload)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def _apply(client: AsyncClient, job: dict[str, Any], candidate: dict[str, Any]) -> Any:
    response = await client.post(
        APPLICATIONS_URL, json={"job_id": job["id"], "candidate_id": candidate["id"]}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _stages(client: AsyncClient, job: dict[str, Any]) -> dict[str, str]:
    """Map stage name to stage ID for a job's pipeline."""
    response = await client.get(f"{JOBS_URL}/{job['id']}/stages")
    assert response.status_code == 200, response.text
    return {stage["name"]: stage["id"] for stage in response.json()}


def _application_events(db: Session, application_id: str) -> list[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(
            AuditEvent.target_entity == "application",
            AuditEvent.target_id == uuid.UUID(application_id),
        )
        .order_by(AuditEvent.created_at)
        .all()
    )


@pytest.mark.asyncio
async def test_registration_seeds_default_stages(
    async_client: AsyncClient, committed_db: Session
) -> None:
    """A newly registered organization gets the six default stages in order."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "org_name": "Stage Org",
            "org_slug": "stage-org",
            "admin_full_name": "Stage Admin",
            "admin_email": "admin@stageorg.com",
            "admin_password": "SuperSecret123!",
        },
    )
    assert response.status_code == 201, response.text

    stages = (
        committed_db.query(PipelineStage)
        .filter(PipelineStage.org_id == uuid.UUID(response.json()["org_id"]))
        .order_by(PipelineStage.stage_order)
        .all()
    )
    assert [s.name for s in stages] == DEFAULT_STAGE_NAMES
    assert [s.stage_order for s in stages] == [1, 2, 3, 4, 5, 6]
    assert {s.job_id for s in stages} == {None}


@pytest.mark.asyncio
async def test_job_stages(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A job uses the org defaults until it has stages of its own."""
    admin = create_user("admin")
    login_as(admin)
    job = await _create_job(async_client)
    stages_url = f"{JOBS_URL}/{job['id']}/stages"

    stages = (await async_client.get(stages_url)).json()
    assert [s["name"] for s in stages] == DEFAULT_STAGE_NAMES
    assert [s["stage_type"] for s in stages] == [
        "applied",
        "screening",
        "interview",
        "offer",
        "hired",
        "rejected",
    ]
    assert {s["org_id"] for s in stages} == {str(admin.org_id)}
    assert {s["job_id"] for s in stages} == {None}

    committed_db.add(
        PipelineStage(
            org_id=admin.org_id,
            job_id=uuid.UUID(job["id"]),
            name="Phone Screen",
            stage_order=1,
            stage_type="custom",
        )
    )
    committed_db.commit()
    own = (await async_client.get(stages_url)).json()
    assert [(s["name"], s["job_id"]) for s in own] == [("Phone Screen", job["id"])]

    assert (await async_client.get(f"{JOBS_URL}/{uuid.uuid4()}/stages")).status_code == 404


@pytest.mark.asyncio
async def test_create_application(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A new application starts in Applied, with a first history row and an audit event."""
    recruiter = create_user("recruiter")
    login_as(recruiter)
    job = await _create_job(async_client)
    candidate = await _create_candidate(async_client)
    stages = await _stages(async_client, job)

    application = await _apply(async_client, job, candidate)

    assert application["org_id"] == str(recruiter.org_id)
    assert application["job_id"] == job["id"]
    assert application["candidate_id"] == candidate["id"]
    assert application["stage_id"] == stages["Applied"]
    assert application["status"] == "active"
    assert application["rejection_reason"] is None
    assert application["applied_at"] and application["updated_at"]

    application_url = f"{APPLICATIONS_URL}/{application['id']}"
    assert (await async_client.get(application_url)).json() == application

    (entry,) = (await async_client.get(f"{application_url}/history")).json()
    assert entry["application_id"] == application["id"]
    assert entry["from_stage_id"] is None
    assert entry["to_stage_id"] == stages["Applied"]
    assert entry["reason"] is None
    assert entry["moved_by"] == str(recruiter.id)

    (event,) = _application_events(committed_db, application["id"])
    assert event.action == "create_application"
    assert event.org_id == recruiter.org_id
    assert event.user_id == recruiter.id
    assert event.details == {
        "job_id": job["id"],
        "candidate_id": candidate["id"],
        "stage_id": stages["Applied"],
    }


@pytest.mark.asyncio
async def test_create_application_rejections(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Duplicates, unknown IDs and closed or archived jobs are refused."""
    login_as(create_user("admin"))
    job = await _create_job(async_client)
    candidate = await _create_candidate(async_client)
    body = {"job_id": job["id"], "candidate_id": candidate["id"]}

    await _apply(async_client, job, candidate)
    assert (await async_client.post(APPLICATIONS_URL, json=body)).status_code == 409

    # The same candidate can still apply to another job.
    await _apply(async_client, await _create_job(async_client, "Second Role"), candidate)

    unknown = str(uuid.uuid4())
    for bad in ({**body, "job_id": unknown}, {**body, "candidate_id": unknown}):
        assert (await async_client.post(APPLICATIONS_URL, json=bad)).status_code == 404
    for bad in ({"job_id": job["id"]}, {**body, "candidate_id": "nope"}):
        assert (await async_client.post(APPLICATIONS_URL, json=bad)).status_code == 422

    other = await _create_candidate(async_client, "Sam")
    closed = await _create_job(async_client, "Closed Role")
    await async_client.patch(f"{JOBS_URL}/{closed['id']}/status", json={"status": "closed"})
    archived = await _create_job(async_client, "Archived Role")
    await async_client.post(f"{JOBS_URL}/{archived['id']}/archive")
    for blocked in (closed, archived):
        response = await async_client.post(
            APPLICATIONS_URL, json={"job_id": blocked["id"], "candidate_id": other["id"]}
        )
        assert response.status_code == 409

    listing = (await async_client.get(APPLICATIONS_URL)).json()
    assert listing["pagination"]["total_items"] == 2


@pytest.mark.asyncio
async def test_move_application_stage(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Each move updates the stage, appends history with who/from/to/reason, and is audited."""
    recruiter = create_user("recruiter")
    admin = create_user("admin", org_id=recruiter.org_id)
    login_as(recruiter)
    job = await _create_job(async_client)
    application = await _apply(async_client, job, await _create_candidate(async_client))
    stages = await _stages(async_client, job)
    application_url = f"{APPLICATIONS_URL}/{application['id']}"
    stage_url = f"{application_url}/stage"

    # Move without a reason.
    response = await async_client.patch(stage_url, json={"stage_id": stages["Shortlisted"]})
    assert response.status_code == 200
    moved = response.json()
    assert moved["stage_id"] == stages["Shortlisted"]
    assert moved["status"] == "active"
    assert moved["updated_at"] >= application["updated_at"]

    # Same stage again: nothing changes, no history row, no audit event.
    again = await async_client.patch(stage_url, json={"stage_id": stages["Shortlisted"]})
    assert again.status_code == 200
    assert again.json() == moved
    assert len((await async_client.get(f"{application_url}/history")).json()) == 2
    assert len(_application_events(committed_db, application["id"])) == 2

    # Another user rejects with a reason.
    login_as(admin)
    rejected = (
        await async_client.patch(
            stage_url, json={"stage_id": stages["Rejected"], "reason": "  Not enough Python  "}
        )
    ).json()
    assert rejected["stage_id"] == stages["Rejected"]
    assert rejected["status"] == "rejected"
    assert rejected["rejection_reason"] == "Not enough Python"

    # Moving back out of Rejected reactivates the application; a blank reason is no reason.
    reopened = (
        await async_client.patch(stage_url, json={"stage_id": stages["Hired"], "reason": "  "})
    ).json()
    assert reopened["status"] == "hired"
    assert reopened["rejection_reason"] is None
    back = (await async_client.patch(stage_url, json={"stage_id": stages["Interview"]})).json()
    assert back["status"] == "active"
    assert (await async_client.get(application_url)).json() == back

    history = (await async_client.get(f"{application_url}/history")).json()
    assert [
        (h["from_stage_id"], h["to_stage_id"], h["reason"], h["moved_by"]) for h in history
    ] == [
        (None, stages["Applied"], None, str(recruiter.id)),
        (stages["Applied"], stages["Shortlisted"], None, str(recruiter.id)),
        (stages["Shortlisted"], stages["Rejected"], "Not enough Python", str(admin.id)),
        (stages["Rejected"], stages["Hired"], None, str(admin.id)),
        (stages["Hired"], stages["Interview"], None, str(admin.id)),
    ]
    assert [h["moved_at"] for h in history] == sorted(h["moved_at"] for h in history)

    events = _application_events(committed_db, application["id"])
    assert [e.action for e in events] == ["create_application"] + ["move_application_stage"] * 4
    assert [e.user_id for e in events] == [recruiter.id, recruiter.id, admin.id, admin.id, admin.id]
    assert events[2].details == {
        "job_id": job["id"],
        "from_stage_id": stages["Shortlisted"],
        "to_stage_id": stages["Rejected"],
        "from": "Shortlisted",
        "to": "Rejected",
        "has_reason": True,
    }
    assert events[1].details["has_reason"] is False
    assert [(e.details["from"], e.details["to"]) for e in events[1:]] == [
        ("Applied", "Shortlisted"),
        ("Shortlisted", "Rejected"),
        ("Rejected", "Hired"),
        ("Hired", "Interview"),
    ]


@pytest.mark.asyncio
async def test_stage_move_keeps_the_score_shown_at_the_time(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Each move records the application's latest score, and a later re-score does not change it."""
    admin = create_user("admin")
    login_as(admin)
    job = await _create_job(async_client)
    candidate = await _create_candidate(async_client)
    application = await _apply(async_client, job, candidate)
    stages = await _stages(async_client, job)
    application_url = f"{APPLICATIONS_URL}/{application['id']}"

    async def move(stage: str) -> None:
        response = await async_client.patch(
            f"{application_url}/stage", json={"stage_id": stages[stage]}
        )
        assert response.status_code == 200, response.text

    async def snapshots() -> list[tuple[float | None, str | None]]:
        history = (await async_client.get(f"{application_url}/history")).json()
        return [(h["overall_score"], h["model_version"]) for h in history]

    # No score yet: the move is recorded without one.
    await move("Shortlisted")
    assert await snapshots() == [(None, None), (None, None)]

    # A baseline score that does not compute every component.
    score = Score(
        id=uuid.uuid4(),
        org_id=admin.org_id,
        application_id=uuid.UUID(application["id"]),
        job_id=uuid.UUID(job["id"]),
        candidate_id=uuid.UUID(candidate["id"]),
        overall_score=72.5,
        skill_overlap_score=None,
        semantic_score=72.5,
        experience_score=None,
        title_fit_score=None,
        model_version="tfidf-skills-0.1.0",
    )
    committed_db.add(score)
    committed_db.commit()
    await move("Interview")
    assert (await snapshots())[-1] == (72.5, "tfidf-skills-0.1.0")

    # Re-scoring with the same model replaces the row; a newer model adds one.
    score.overall_score = 40.0
    committed_db.add(
        Score(
            id=uuid.uuid4(),
            org_id=admin.org_id,
            application_id=score.application_id,
            job_id=score.job_id,
            candidate_id=score.candidate_id,
            overall_score=91.25,
            semantic_score=88.0,
            model_version="tfidf-skills-0.2.0",
            calculated_at=datetime.now(UTC) + timedelta(minutes=1),
        )
    )
    committed_db.commit()
    await move("Offer")

    assert await snapshots() == [
        (None, None),
        (None, None),
        (72.5, "tfidf-skills-0.1.0"),
        (91.25, "tfidf-skills-0.2.0"),
    ]


@pytest.mark.asyncio
async def test_move_application_stage_invalid_targets(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Unknown stages, and stages of another job's own pipeline, are refused."""
    admin = create_user("admin")
    login_as(admin)
    job = await _create_job(async_client)
    application = await _apply(async_client, job, await _create_candidate(async_client))
    stage_url = f"{APPLICATIONS_URL}/{application['id']}/stage"

    custom_job = await _create_job(async_client, "Custom Pipeline Role")
    custom_stage = PipelineStage(
        id=uuid.uuid4(),
        org_id=admin.org_id,
        job_id=uuid.UUID(custom_job["id"]),
        name="Phone Screen",
        stage_order=1,
        stage_type="custom",
    )
    committed_db.add(custom_stage)
    committed_db.commit()

    for stage_id in (str(uuid.uuid4()), str(custom_stage.id)):
        response = await async_client.patch(stage_url, json={"stage_id": stage_id})
        assert response.status_code == 404
    for bad in ({}, {"stage_id": "nope"}, {"stage_id": str(custom_stage.id), "reason": 5}):
        assert (await async_client.patch(stage_url, json=bad)).status_code == 422
    missing_url = f"{APPLICATIONS_URL}/{uuid.uuid4()}/stage"
    response = await async_client.patch(missing_url, json={"stage_id": str(custom_stage.id)})
    assert response.status_code == 404

    unchanged = (await async_client.get(f"{APPLICATIONS_URL}/{application['id']}")).json()
    assert unchanged == application
    assert len(_application_events(committed_db, application["id"])) == 1

    # A job with its own pipeline starts applications in that pipeline, and its
    # applications cannot move to an org-default stage.
    custom_application = await _apply(
        async_client, custom_job, await _create_candidate(async_client, "Sam")
    )
    assert custom_application["stage_id"] == str(custom_stage.id)
    default_stages = await _stages(async_client, job)
    response = await async_client.patch(
        f"{APPLICATIONS_URL}/{custom_application['id']}/stage",
        json={"stage_id": default_stages["Interview"]},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_applications_filters_and_pagination(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """The list filters by job, candidate, stage and status, newest first."""
    login_as(create_user("admin"))
    job_a = await _create_job(async_client, "Role A")
    job_b = await _create_job(async_client, "Role B")
    alex = await _create_candidate(async_client, "Alex")
    sam = await _create_candidate(async_client, "Sam")
    stages = await _stages(async_client, job_a)

    alex_a = await _apply(async_client, job_a, alex)
    sam_a = await _apply(async_client, job_a, sam)
    alex_b = await _apply(async_client, job_b, alex)
    await async_client.patch(
        f"{APPLICATIONS_URL}/{sam_a['id']}/stage", json={"stage_id": stages["Rejected"]}
    )

    async def ids(**params: Any) -> list[str]:
        response = await async_client.get(APPLICATIONS_URL, params=params)
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()["items"]]

    assert await ids() == [alex_b["id"], sam_a["id"], alex_a["id"]]
    assert await ids(job_id=job_a["id"]) == [sam_a["id"], alex_a["id"]]
    assert await ids(candidate_id=alex["id"]) == [alex_b["id"], alex_a["id"]]
    assert await ids(stage_id=stages["Rejected"]) == [sam_a["id"]]
    assert await ids(status="rejected") == [sam_a["id"]]
    assert await ids(status="active", job_id=job_a["id"]) == [alex_a["id"]]
    assert await ids(job_id=str(uuid.uuid4())) == []

    page2 = (await async_client.get(APPLICATIONS_URL, params={"per_page": 2, "page": 2})).json()
    assert [item["id"] for item in page2["items"]] == [alex_a["id"]]
    assert page2["pagination"] == {
        "page": 2,
        "per_page": 2,
        "total_items": 3,
        "total_pages": 2,
        "has_next": False,
        "has_prev": True,
    }

    for bad in ({"status": "bogus"}, {"job_id": "nope"}, {"page": 0}, {"per_page": 101}):
        assert (await async_client.get(APPLICATIONS_URL, params=bad)).status_code == 422
    assert (await async_client.get(f"{APPLICATIONS_URL}/{uuid.uuid4()}")).status_code == 404
    assert (await async_client.get(f"{APPLICATIONS_URL}/{uuid.uuid4()}/history")).status_code == 404


@pytest.mark.asyncio
async def test_applications_require_authentication(async_client: AsyncClient) -> None:
    """Every applications and stages endpoint rejects anonymous callers."""
    application_url = f"{APPLICATIONS_URL}/{uuid.uuid4()}"
    body = {"job_id": str(uuid.uuid4()), "candidate_id": str(uuid.uuid4())}
    responses = [
        await async_client.get(APPLICATIONS_URL),
        await async_client.post(APPLICATIONS_URL, json=body),
        await async_client.get(application_url),
        await async_client.get(f"{application_url}/history"),
        await async_client.patch(f"{application_url}/stage", json={"stage_id": str(uuid.uuid4())}),
        await async_client.get(f"{JOBS_URL}/{uuid.uuid4()}/stages"),
    ]
    assert [r.status_code for r in responses] == [401] * len(responses)


@pytest.mark.asyncio
async def test_viewer_cannot_create_or_move_applications(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Viewers can read applications, stages and history but cannot create or move."""
    recruiter = create_user("recruiter")
    viewer = create_user("viewer", org_id=recruiter.org_id)

    login_as(recruiter)
    job = await _create_job(async_client)
    candidate = await _create_candidate(async_client)
    other = await _create_candidate(async_client, "Sam")
    application = await _apply(async_client, job, candidate)
    application_url = f"{APPLICATIONS_URL}/{application['id']}"

    login_as(viewer)
    stages = await _stages(async_client, job)
    assert (await async_client.get(application_url)).json() == application
    assert len((await async_client.get(f"{application_url}/history")).json()) == 1
    listing = (await async_client.get(APPLICATIONS_URL)).json()
    assert [item["id"] for item in listing["items"]] == [application["id"]]

    writes = [
        await async_client.post(
            APPLICATIONS_URL, json={"job_id": job["id"], "candidate_id": other["id"]}
        ),
        await async_client.patch(
            f"{application_url}/stage", json={"stage_id": stages["Interview"]}
        ),
    ]
    assert [r.status_code for r in writes] == [403] * len(writes)

    assert (await async_client.get(application_url)).json() == application
    assert len((await async_client.get(f"{application_url}/history")).json()) == 1
    assert [e.action for e in _application_events(committed_db, application["id"])] == [
        "create_application"
    ]
