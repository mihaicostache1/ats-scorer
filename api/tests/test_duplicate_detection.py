"""B-16: suggestions survive formatting and typos, stay tenant-local, and never merge."""

import copy
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from ats_scoring.parsed_cv import Contact, ParsedCV, Skill
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.user import User
from app.services.cv_extraction import _mark_parsed
from app.services.duplicate_detection import DuplicateDetector, normalize_email, normalize_phone

URL = "/api/v1/candidates"


@pytest.fixture
def recruiter(create_user: Callable[..., User], login_as: Callable[[User], None]) -> User:
    user = create_user("recruiter")
    login_as(user)
    return user


async def _create(client: AsyncClient, **fields: Any) -> dict[str, Any]:
    response = await client.post(
        URL,
        json={
            "full_name": "Alex Mercer",
            "email": f"{uuid.uuid4().hex}@example.com",
            **fields,
        },
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


@pytest.mark.parametrize(
    ("incoming", "expected"),
    [
        ("  Alice@Example.COM  ", "alice@example.com"),
        ("first.last+recruiting@example.com", "first.last+recruiting@example.com"),
    ],
)
def test_email_normalization(incoming: str, expected: str) -> None:
    assert normalize_email(incoming) == expected


@pytest.mark.parametrize(
    "incoming",
    ["+40 721 123 456", "0040-721-123-456", "+40 (721) 123.456", "40721123456"],
)
def test_phone_normalization(incoming: str) -> None:
    assert normalize_phone(incoming) == "40721123456"


@pytest.mark.parametrize("incoming", ["", "---", "123", "call me", "1234567890123456"])
def test_unusable_phones_do_not_match(incoming: str) -> None:
    assert normalize_phone(incoming) == ""


@pytest.mark.parametrize("email", ["alice@example.com", "ALICE@EXAMPLE.COM", " Alice@Example.Com "])
async def test_creation_matches_email_casing_without_merging(
    recruiter: User, async_client: AsyncClient, committed_db: Session, email: str
) -> None:
    first = await _create(async_client, full_name="Alice Jones", email="alice@example.com")
    second = await _create(async_client, full_name="Unrelated Person", email=email)
    assert first["possible_duplicates"] == []
    assert second["id"] != first["id"]
    assert second["possible_duplicates"] == [
        {
            "candidate_id": first["id"],
            "full_name": "Alice Jones",
            "matched_on": ["email"],
            "name_similarity": None,
        }
    ]
    assert committed_db.query(Candidate).count() == 2
    committed_db.expire_all()
    original = committed_db.get(Candidate, uuid.UUID(first["id"]))
    assert original is not None and original.full_name == "Alice Jones"


@pytest.mark.parametrize("phone", ["+40 (721) 123-456", "0040 721 123 456", "40721123456"])
async def test_creation_matches_phone_formats(
    recruiter: User, async_client: AsyncClient, phone: str
) -> None:
    first = await _create(async_client, full_name="Alice Jones", phone="+40 721 123 456")
    second = await _create(async_client, full_name="Unrelated Person", phone=phone)
    assert second["possible_duplicates"][0]["candidate_id"] == first["id"]
    assert second["possible_duplicates"][0]["matched_on"] == ["phone"]


@pytest.mark.parametrize(
    "name", ["Alex Mercar", "Alxe Mercer", "  MERCER, Álex  ", "Alex   Mercer"]
)
async def test_creation_matches_name_typos_and_normalization(
    recruiter: User, async_client: AsyncClient, name: str
) -> None:
    first = await _create(async_client)
    second = await _create(async_client, full_name=name)
    (match,) = second["possible_duplicates"]
    assert match["candidate_id"] == first["id"]
    assert match["matched_on"] == ["name"]
    assert 85 <= match["name_similarity"] <= 100


async def test_unrelated_and_missing_contacts_do_not_generate_warnings(
    recruiter: User, async_client: AsyncClient
) -> None:
    await _create(async_client, full_name="Alice Jones", phone="---")
    second = await _create(async_client, full_name="Robert Chen", phone="")
    assert second["possible_duplicates"] == []


async def test_reasons_are_combined_once_and_self_is_excluded(
    recruiter: User, async_client: AsyncClient
) -> None:
    first = await _create(async_client, email="alex@example.com", phone="+40 721 123 456")
    second = await _create(
        async_client, email="ALEX@EXAMPLE.COM", phone="0040 (721) 123-456", full_name="Alex Mercar"
    )
    (match,) = second["possible_duplicates"]
    assert match["candidate_id"] == first["id"]
    assert match["matched_on"] == ["email", "phone", "name"]
    fetched = await async_client.get(f"{URL}/{second['id']}")
    assert fetched.json()["possible_duplicates"] == second["possible_duplicates"]


async def test_other_organizations_are_excluded_even_in_an_unscoped_session(
    recruiter: User,
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    first = await _create(async_client, email="alex@example.com", phone="+40 721 123 456")
    outsider = create_user("admin")
    login_as(outsider)
    second = await _create(async_client, email="alex@example.com", phone="0040 721 123 456")
    assert second["possible_duplicates"] == []
    candidate = committed_db.get(Candidate, uuid.UUID(first["id"]))
    assert candidate is not None
    # The background worker does not have get_tenant_db's automatic organization filter.
    assert DuplicateDetector(committed_db, recruiter.org_id).find(candidate) == []
    assert DuplicateDetector(committed_db, outsider.org_id).find(candidate) == []
    login_as(recruiter)
    assert (await async_client.get(f"{URL}/{first['id']}")).json()["possible_duplicates"] == []
    assert (await async_client.get(f"{URL}/{second['id']}")).status_code == 404


@pytest.mark.parametrize("parsed_status", ["parsed", "needs_review"])
async def test_after_parsing_matches_contacts_without_changing_canonical_identity(
    recruiter: User,
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    parsed_status: str,
) -> None:
    existing = await _create(
        async_client, full_name="Alice Jones", email="alice@example.com", phone="+40 721 123 456"
    )
    outsider = create_user("admin")
    committed_db.add(
        Candidate(
            org_id=outsider.org_id,
            full_name="Alice Jones",
            email="alice@example.com",
            phone="+40 721 123 456",
        )
    )
    pending = await _create(async_client, full_name="Upload Placeholder")
    assert pending["possible_duplicates"] == []
    candidate_id = uuid.UUID(pending["id"])
    document = CvDocument(
        id=uuid.uuid4(),
        org_id=recruiter.org_id,
        candidate_id=candidate_id,
        storage_key=f"{uuid.uuid4()}.pdf",
        original_filename="cv.pdf",
        content_type="application/pdf",
        size_bytes=100,
        sha256="a" * 64,
        status="extracted",
        extracted_text="Alice Jones, alice@example.com, +40 721 123 456",
    )
    committed_db.add(document)
    committed_db.commit()
    profile = ParsedCV(
        schema_version="1.0",
        source="parser",
        contact=Contact(name="Alice Jonse", email="ALICE@EXAMPLE.COM", phone="0040 (721) 123-456"),
        skills=[Skill(raw="Python", normalized="Python")],
        confidence={"/contact/name": 0.5 if parsed_status == "needs_review" else 0.99},
    )
    assert _mark_parsed(SessionLocal, document.id, profile) == parsed_status
    response = await async_client.get(f"{URL}/{candidate_id}")
    data = response.json()
    (match,) = data["possible_duplicates"]
    assert match["candidate_id"] == existing["id"]
    assert match["matched_on"] == ["email", "phone", "name"]
    assert data["full_name"] == "Upload Placeholder" and data["email"] == pending["email"]
    status = await async_client.get(f"{URL}/{candidate_id}/cv/{document.id}")
    assert status.json()["status"] == parsed_status
    assert status.json()["possible_duplicates"] == data["possible_duplicates"]
    documents = await async_client.get(f"{URL}/{candidate_id}/cv")
    assert documents.json()[0]["possible_duplicates"] == data["possible_duplicates"]
    # Matching also reads the other candidate's parsed contacts, in either direction.
    reverse = (await async_client.get(f"{URL}/{existing['id']}")).json()["possible_duplicates"]
    assert [item["candidate_id"] for item in reverse] == [pending["id"]]
    committed_db.expire_all()
    candidate = committed_db.get(Candidate, candidate_id)
    assert candidate is not None
    assert candidate.parsed_data_original == profile.model_dump(mode="json")
    assert committed_db.query(Candidate).count() == 3


async def test_creation_checks_other_candidates_parsed_contacts(
    recruiter: User, async_client: AsyncClient, committed_db: Session
) -> None:
    first = await _create(async_client, full_name="Upload Placeholder")
    candidate = committed_db.get(Candidate, uuid.UUID(first["id"]))
    assert candidate is not None
    candidate.parsed_data = ParsedCV(
        schema_version="1.0", source="parser", contact=Contact(email="other@example.org"), skills=[]
    ).model_dump(mode="json")
    committed_db.commit()
    second = await _create(async_client, full_name="Different Person", email="OTHER@EXAMPLE.ORG")
    assert second["possible_duplicates"][0]["candidate_id"] == first["id"]
    assert second["possible_duplicates"][0]["matched_on"] == ["email"]


async def test_suggestions_reflect_corrections_and_deletion_without_stale_ids(
    recruiter: User,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    first = await _create(async_client, full_name="Alice Jones", phone="+40 721 123 456")
    second = await _create(async_client, full_name="Robert Chen")
    updated = await async_client.patch(f"{URL}/{second['id']}", json={"phone": "0040 721 123 456"})
    assert updated.json()["possible_duplicates"][0]["candidate_id"] == first["id"]
    # Repeated unchanged PATCHes and list responses include the current suggestions too.
    unchanged = await async_client.patch(f"{URL}/{second['id']}", json={})
    assert unchanged.json()["possible_duplicates"] == updated.json()["possible_duplicates"]
    listing = (await async_client.get(URL, params={"per_page": 1})).json()
    assert len(listing["items"]) == 1
    assert len(listing["items"][0]["possible_duplicates"]) == 1
    before = copy.deepcopy(updated.json())
    cleared = await async_client.patch(f"{URL}/{second['id']}", json={"phone": None})
    assert cleared.json()["possible_duplicates"] == []
    assert before["id"] == cleared.json()["id"]
    await async_client.patch(f"{URL}/{second['id']}", json={"phone": "+40 721 123 456"})
    login_as(create_user("admin", org_id=recruiter.org_id))
    assert (await async_client.delete(f"{URL}/{first['id']}")).status_code == 204
    assert (await async_client.get(f"{URL}/{second['id']}")).json()["possible_duplicates"] == []


async def test_exact_matches_sort_before_name_only_matches(
    recruiter: User, async_client: AsyncClient
) -> None:
    name_only = await _create(async_client, full_name="Alex Mercar")
    phone = await _create(async_client, full_name="Robert Chen", phone="+40 721 123 456")
    email = await _create(async_client, full_name="Alice Jones", email="shared@example.org")
    subject = await _create(async_client, email="shared@example.org", phone="0040 721 123 456")
    assert [match["candidate_id"] for match in subject["possible_duplicates"]] == [
        email["id"],
        phone["id"],
        name_only["id"],
    ]
