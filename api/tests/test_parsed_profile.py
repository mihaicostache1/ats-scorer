"""Recruiter correction validation, authorization, provenance and atomicity."""

import copy
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jsonschema
import pytest
from ats_scoring.parsed_cv import Contact, ParsedCV, Skill
from ats_scoring.schema import load_parsed_cv_schema
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.audit_event import AuditEvent
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.user import User
from app.services.cv_extraction import _mark_parsed

Profile = tuple[User, Candidate, CvDocument]


def _url(candidate: Candidate) -> str:
    return f"/api/v1/candidates/{candidate.id}/parsed-profile"


def _events(db: Session) -> list[AuditEvent]:
    return db.query(AuditEvent).filter(AuditEvent.action == "correct_parsed_profile").all()


@pytest.fixture
async def profile(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> Profile:
    reviewer = create_user("recruiter")
    login_as(reviewer)
    response = await async_client.post(
        "/api/v1/candidates",
        json={
            "full_name": "Jane Smith",
            "email": "jane@example.com",
            "phone": "+1-212-555-0100",
        },
    )
    candidate = committed_db.get(Candidate, uuid.UUID(response.json()["id"]))
    assert candidate is not None
    candidate.parsed_data = ParsedCV(
        schema_version="1.0",
        source="parser",
        contact=Contact(name="Jane Smit", email="jane@example.com", phone="+1-212-555-0100"),
        skills=[Skill(raw="Docker", normalized="Docker")],
        summary="Original summary",
        confidence={"/contact/name": 0.5, "/contact/email": 0.99, "/skills/0/normalized": 0.98},
    ).model_dump(mode="json")
    candidate.parsed_data_original = copy.deepcopy(candidate.parsed_data)
    document = CvDocument(
        id=uuid.uuid4(),
        org_id=candidate.org_id,
        candidate_id=candidate.id,
        storage_key=f"{uuid.uuid4()}.pdf",
        original_filename="cv.pdf",
        content_type="application/pdf",
        size_bytes=100,
        sha256="a" * 64,
        status="needs_review",
        extracted_text="Original text",
    )
    committed_db.add(document)
    committed_db.commit()
    return reviewer, candidate, document


async def test_correct_profile_records_reviewer_preserves_snapshot_and_audits(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
) -> None:
    reviewer, candidate, document = profile
    original = copy.deepcopy(candidate.parsed_data_original)
    before = datetime.now(UTC)
    response = await async_client.patch(
        _url(candidate),
        json={
            "contact": {"name": "Jane Smith", "email": "Corrected@Example.org", "phone": None},
            "summary": "Corrected summary",
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    jsonschema.validate(result["parsed_data"], load_parsed_cv_schema())
    assert result["candidate_id"] == str(candidate.id)
    assert result["reviewed_by"] == str(reviewer.id)
    assert before <= datetime.fromisoformat(result["reviewed_at"])
    assert result["parsed_data"]["source"] == "recruiter"
    assert result["parsed_data"]["skills"] == original["skills"]
    assert result["parsed_data"]["confidence"]["/contact/name"] == 1
    assert result["parsed_data"]["confidence"]["/summary"] == 1
    committed_db.refresh(candidate)
    committed_db.refresh(document)
    assert candidate.parsed_data == result["parsed_data"]
    assert candidate.parsed_data_original == original
    assert candidate.email == "corrected@example.org"
    assert candidate.phone is None
    assert candidate.parsed_profile_reviewed_by == reviewer.id
    assert candidate.parsed_profile_reviewed_at == datetime.fromisoformat(result["reviewed_at"])
    assert document.status == "parsed"
    (event,) = _events(committed_db)
    assert event.user_id == reviewer.id and event.org_id == candidate.org_id
    assert event.target_entity == "candidate" and event.target_id == candidate.id
    assert event.details == {
        "changed_fields": ["/contact/email", "/contact/name", "/contact/phone", "/summary"],
        "schema_version": "1.0",
    }
    assert "Corrected summary" not in str(event.details)
    fetched = (await async_client.get(f"/api/v1/candidates/{candidate.id}")).json()
    assert fetched["parsed_profile_reviewed_by"] == str(reviewer.id)
    assert datetime.fromisoformat(fetched["parsed_profile_reviewed_at"]) == datetime.fromisoformat(
        result["reviewed_at"]
    )


@pytest.mark.parametrize(
    "raw,suggestion",
    [
        ("project managment", "project management"),
        ("Unit Testing", "perform software unit testing"),
    ],
)
async def test_suggestions_survive_review_until_explicitly_accepted(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
    raw: str,
    suggestion: str,
) -> None:
    _, candidate, document = profile
    parsed = ParsedCV.model_validate(candidate.parsed_data)
    parsed.schema_version = "1.1"
    parsed.skills = [Skill(raw=raw, normalized=None, suggestion=suggestion)]
    parsed.confidence = {"/skills/0/normalized": 0.6}
    candidate.parsed_data = parsed.model_dump(mode="json")
    candidate.parsed_data_original = copy.deepcopy(candidate.parsed_data)
    committed_db.commit()
    original = copy.deepcopy(candidate.parsed_data_original)

    response = await async_client.patch(_url(candidate), json={"summary": "Reviewed summary"})
    assert response.status_code == 200, response.text
    data = response.json()["parsed_data"]
    jsonschema.validate(data, load_parsed_cv_schema())
    assert data["schema_version"] == "1.1"
    assert data["skills"] == original["skills"]
    assert data["skills"][0]["normalized"] is None
    assert data["confidence"]["/skills/0/normalized"] == 0.6
    committed_db.refresh(document)
    assert document.status == "needs_review"

    accepted = await async_client.patch(
        _url(candidate), json={"skills": [{"raw": raw, "normalized": suggestion}]}
    )
    assert accepted.status_code == 200, accepted.text
    skill = accepted.json()["parsed_data"]["skills"][0]
    assert skill["normalized"] == suggestion
    assert skill["suggestion"] is None
    committed_db.refresh(candidate)
    committed_db.refresh(document)
    assert candidate.parsed_data_original == original
    assert document.status == "parsed"


@pytest.mark.parametrize(
    "patch,location",
    [
        ({"skills": ["Python"]}, ["body", "skills", 0]),
        ({"skills": [{"raw": "Python"}]}, ["body", "skills", 0, "normalized"]),
        (
            {"experiences": [{"title": "Engineer", "start": "2020-13"}]},
            ["body", "experiences", 0, "start"],
        ),
        (
            {"education": [{"degree": "BSc", "grad_year": "2020"}]},
            ["body", "education", 0, "grad_year"],
        ),
        ({"experience_years": -1}, ["body", "experience_years"]),
        ({"contact": {"unknown": "x"}}, ["body", "contact", "unknown"]),
        ({"schema_version": "0.1"}, ["body", "schema_version"]),
        ({"source": "other"}, ["body", "source"]),
        ({"reviewed_by": str(uuid.uuid4())}, ["body", "reviewed_by"]),
        ({"confidence": {"/summary": 2}}, ["body", "confidence", "/summary"]),
        ({"contact": {"name": None}}, ["body", "contact", "name"]),
        ({"contact": {"email": "invalid"}}, ["body", "contact", "email"]),
        ({"contact": {"phone": "1" * 51}}, ["body", "contact", "phone"]),
    ],
)
async def test_field_errors_do_not_mutate_profile_or_audit(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
    patch: dict[str, Any],
    location: list[str | int],
) -> None:
    _, candidate, document = profile
    original = copy.deepcopy(candidate.parsed_data)
    response = await async_client.patch(_url(candidate), json=patch)
    assert response.status_code == 422, response.text
    assert location in [error["loc"] for error in response.json()["detail"]]
    committed_db.refresh(candidate)
    committed_db.refresh(document)
    assert candidate.parsed_data == candidate.parsed_data_original == original
    assert candidate.parsed_profile_reviewed_at is None
    assert document.status == "needs_review"
    assert not _events(committed_db)


async def test_viewers_anonymous_and_other_tenants_cannot_correct(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    _, candidate, _ = profile
    login_as(create_user("viewer", org_id=candidate.org_id))
    assert (await async_client.patch(_url(candidate), json={"summary": "x"})).status_code == 403
    login_as(create_user("admin"))
    assert (await async_client.patch(_url(candidate), json={"summary": "x"})).status_code == 404
    async_client.cookies.clear()
    assert (await async_client.patch(_url(candidate), json={"summary": "x"})).status_code == 401
    committed_db.refresh(candidate)
    assert candidate.parsed_data == candidate.parsed_data_original
    assert not _events(committed_db)


async def test_admin_can_review_and_each_save_records_current_reviewer(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    reviewer, candidate, _ = profile
    first = await async_client.patch(_url(candidate), json={})
    assert first.status_code == 200
    assert first.json()["reviewed_by"] == str(reviewer.id)
    admin = create_user("admin", org_id=candidate.org_id)
    login_as(admin)
    second = await async_client.patch(_url(candidate), json={"summary": "Admin correction"})
    assert second.status_code == 200
    assert second.json()["reviewed_by"] == str(admin.id)
    assert second.json()["reviewed_at"] >= first.json()["reviewed_at"]
    assert len(_events(committed_db)) == 2


async def test_contact_email_conflict_rolls_back_all_changes(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
) -> None:
    _, candidate, document = profile
    await async_client.post(
        "/api/v1/candidates",
        json={
            "full_name": "Other Person",
            "email": "other@example.org",
        },
    )
    response = await async_client.patch(
        _url(candidate),
        json={
            "summary": "Must be rolled back",
            "contact": {"email": "OTHER@EXAMPLE.ORG"},
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "contact", "email"]
    committed_db.refresh(candidate)
    committed_db.refresh(document)
    assert candidate.parsed_data == candidate.parsed_data_original
    assert candidate.email == "jane@example.com"
    assert candidate.parsed_profile_reviewed_at is None
    assert document.status == "needs_review" and not _events(committed_db)


async def test_replaced_lists_reset_confidence_without_stale_indexes(
    profile: Profile,
    async_client: AsyncClient,
) -> None:
    _, candidate, _ = profile
    response = await async_client.patch(
        _url(candidate),
        json={
            "skills": [
                {"raw": "FastAPI", "normalized": "FastAPI"},
                {"raw": "Docker", "normalized": "Docker"},
            ],
        },
    )
    assert response.status_code == 200
    confidence = response.json()["parsed_data"]["confidence"]
    assert confidence["/skills/0/normalized"] == confidence["/skills/1/normalized"] == 1
    cleared = await async_client.patch(_url(candidate), json={"skills": []})
    confidence = cleared.json()["parsed_data"]["confidence"]
    assert confidence["/skills"] == 1
    assert not any(key.startswith("/skills/") for key in confidence)


async def test_client_cannot_assign_confidence_or_authorship(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
) -> None:
    _, candidate, document = profile
    response = await async_client.patch(
        _url(candidate),
        json={
            "source": "parser",
            "confidence": {"/contact/name": 1, "/skills/999/raw": 1},
        },
    )
    assert response.status_code == 200
    assert response.json()["parsed_data"]["source"] == "recruiter"
    confidence = response.json()["parsed_data"]["confidence"]
    assert confidence["/contact/name"] == 0.5
    assert "/skills/999/raw" not in confidence
    committed_db.refresh(document)
    assert document.status == "needs_review"


@pytest.mark.parametrize("status", ["queued", "extracting", "extracted", "failed"])
async def test_unfinished_latest_cv_cannot_be_reviewed(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
    status: str,
) -> None:
    _, candidate, document = profile
    document.status = status
    committed_db.commit()
    assert (await async_client.patch(_url(candidate), json={})).status_code == 409
    assert not _events(committed_db)


async def test_invalid_existing_profile_and_unknown_ids(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
) -> None:
    _, candidate, _ = profile
    candidate.parsed_data = {}
    committed_db.commit()
    assert (await async_client.patch(_url(candidate), json={})).status_code == 409
    assert (
        await async_client.patch(
            f"/api/v1/candidates/{uuid.uuid4()}/parsed-profile",
            json={},
        )
    ).status_code == 404
    assert (
        await async_client.patch(
            "/api/v1/candidates/invalid/parsed-profile",
            json={},
        )
    ).status_code == 422


async def test_new_parser_output_clears_previous_review_metadata(
    profile: Profile,
    async_client: AsyncClient,
    committed_db: Session,
) -> None:
    _, candidate, document = profile
    assert (
        await async_client.patch(_url(candidate), json={"summary": "Reviewed"})
    ).status_code == 200
    new_document = CvDocument(
        id=uuid.uuid4(),
        org_id=candidate.org_id,
        candidate_id=candidate.id,
        storage_key=f"{uuid.uuid4()}.pdf",
        original_filename="new.pdf",
        content_type="application/pdf",
        size_bytes=100,
        sha256="b" * 64,
        status="extracted",
        extracted_text="New text",
        created_at=document.created_at + timedelta(seconds=1),
    )
    committed_db.add(new_document)
    committed_db.commit()
    assert (
        _mark_parsed(
            SessionLocal,
            new_document.id,
            ParsedCV(
                schema_version="1.0",
                source="parser",
                skills=[],
            ),
        )
        == "needs_review"
    )
    committed_db.refresh(candidate)
    assert candidate.parsed_profile_reviewed_by is None
    assert candidate.parsed_profile_reviewed_at is None
    assert candidate.parsed_data["source"] == "parser"
