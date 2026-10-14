"""CV upload, status and download endpoint tests, using the L-5 synthetic PDFs."""

import hashlib
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.orm import Session
from starlette.routing import Mount

from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.cv_document import CvDocument
from app.models.user import User
from app.services.storage import LocalDiskStorage, StorageError, new_cv_storage_key

CANDIDATES_URL = "/api/v1/candidates"

# Three layouts (classic, two-column, table) from the L-5 generator, seed 42.
FIXTURES = Path(__file__).parent / "fixtures" / "cvs"
L5_PDFS = sorted(FIXTURES.glob("*.pdf"))
PDF_BYTES = (FIXTURES / "C001.pdf").read_bytes()


def _padded_pdf(size: int) -> bytes:
    """Bytes of exactly ``size`` that pass the content check."""
    header, trailer = b"%PDF-1.4\n", b"\n%%EOF\n"
    return header + b"0" * (size - len(header) - len(trailer)) + trailer


async def _create_candidate(client: AsyncClient) -> dict[str, Any]:
    payload = {"full_name": "Louise Vincent", "email": f"{uuid.uuid4().hex[:8]}@example.com"}
    response = await client.post(CANDIDATES_URL, json=payload)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


async def _upload(
    client: AsyncClient,
    candidate_id: str,
    data: bytes = PDF_BYTES,
    filename: str = "louise-vincent.pdf",
    content_type: str = "application/pdf",
) -> Response:
    return await client.post(
        f"{CANDIDATES_URL}/{candidate_id}/cv", files={"file": (filename, data, content_type)}
    )


def _stored_files(storage_root: Path) -> list[Path]:
    return [path for path in storage_root.rglob("*") if path.is_file()]


def _cv_events(db: Session, cv_id: str) -> list[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.target_entity == "cv_document", AuditEvent.target_id == uuid.UUID(cv_id))
        .order_by(AuditEvent.created_at)
        .all()
    )


def test_l5_fixtures_are_present() -> None:
    """The L-5 PDFs these tests rely on are in the repo."""
    assert [path.name for path in L5_PDFS] == ["C001.pdf", "C002.pdf", "C003.pdf"]


@pytest.mark.asyncio
async def test_upload_cv(
    async_client: AsyncClient,
    committed_db: Session,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """An uploaded PDF is stored under a random key and recorded as queued."""
    recruiter = create_user("recruiter")
    login_as(recruiter)
    candidate = await _create_candidate(async_client)

    response = await _upload(async_client, candidate["id"])
    assert response.status_code == 201, response.text
    document = response.json()

    assert document["status"] == "queued"
    assert document["org_id"] == str(recruiter.org_id)
    assert document["candidate_id"] == candidate["id"]
    assert document["original_filename"] == "louise-vincent.pdf"
    assert document["content_type"] == "application/pdf"
    assert document["size_bytes"] == len(PDF_BYTES)
    assert document["sha256"] == hashlib.sha256(PDF_BYTES).hexdigest()
    assert document["uploaded_by"] == str(recruiter.id)
    # The storage location is never part of a response.
    assert "storage_key" not in document
    assert "cvs/" not in response.text

    # Exactly one file on disk, with the uploaded bytes, under a key that takes
    # nothing from the candidate, the document ID or the original filename.
    row = committed_db.get(CvDocument, uuid.UUID(document["id"]))
    assert row is not None
    (stored,) = _stored_files(tmp_path / "storage")
    assert stored.read_bytes() == PDF_BYTES
    assert stored.relative_to(tmp_path / "storage").as_posix() == row.storage_key
    assert row.storage_key.startswith(f"cvs/{recruiter.org_id}/")
    for leaked in ("louise", "vincent", candidate["id"], document["id"]):
        assert leaked not in row.storage_key
    assert len(stored.stem) == 64

    (event,) = _cv_events(committed_db, document["id"])
    assert event.action == "upload_cv"
    assert event.org_id == recruiter.org_id
    assert event.user_id == recruiter.id
    assert event.details == {"candidate_id": candidate["id"], "size_bytes": len(PDF_BYTES)}


@pytest.mark.asyncio
async def test_upload_every_l5_layout_and_list(
    async_client: AsyncClient,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Every L-5 layout is accepted, each upload gets its own key, and the list is newest first."""
    login_as(create_user("admin"))
    candidate = await _create_candidate(async_client)

    uploaded = []
    for path in L5_PDFS:
        response = await _upload(async_client, candidate["id"], path.read_bytes(), path.name)
        assert response.status_code == 201, response.text
        uploaded.append(response.json())

    # The same file again is a new document with a new key, not an overwrite.
    again = await _upload(async_client, candidate["id"], L5_PDFS[0].read_bytes(), L5_PDFS[0].name)
    assert again.status_code == 201
    uploaded.append(again.json())
    assert len({doc["id"] for doc in uploaded}) == 4
    assert len(_stored_files(tmp_path / "storage")) == 4

    listing = await async_client.get(f"{CANDIDATES_URL}/{candidate['id']}/cv")
    assert listing.status_code == 200
    assert [doc["id"] for doc in listing.json()] == [doc["id"] for doc in reversed(uploaded)]
    assert {doc["status"] for doc in listing.json()} == {"queued"}

    other = await _create_candidate(async_client)
    assert (await async_client.get(f"{CANDIDATES_URL}/{other['id']}/cv")).json() == []


@pytest.mark.asyncio
async def test_upload_rejects_non_pdf_content(
    async_client: AsyncClient,
    committed_db: Session,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """The content decides, whatever the extension or declared type says."""
    login_as(create_user("recruiter"))
    candidate = await _create_candidate(async_client)

    not_pdfs = [
        b"",
        b"Just a text file renamed to .pdf",
        b"PK\x03\x04 a docx is a zip archive",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
        b"<html><script>alert(1)</script></html>",
        b"junk before the header %PDF-1.4\n%%EOF\n",
        PDF_BYTES[: len(PDF_BYTES) // 2],  # truncated: header but no end-of-file marker
    ]
    for data in not_pdfs:
        response = await _upload(async_client, candidate["id"], data)
        assert response.status_code == 415, data[:20]
        assert response.json()["detail"] == "Only PDF files are accepted."

    # A real PDF is accepted even with a misleading name and declared type.
    disguised = await _upload(async_client, candidate["id"], PDF_BYTES, "notes.txt", "text/plain")
    assert disguised.status_code == 201
    assert disguised.json()["content_type"] == "application/pdf"

    assert (await async_client.post(f"{CANDIDATES_URL}/{candidate['id']}/cv")).status_code == 422

    # Nothing rejected was stored or recorded.
    assert committed_db.query(CvDocument).count() == 1
    assert len(_stored_files(tmp_path / "storage")) == 1


@pytest.mark.asyncio
async def test_upload_size_limit(
    async_client: AsyncClient,
    committed_db: Session,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A file of exactly 10 MB is accepted; one byte more is rejected and not stored."""
    assert settings.MAX_CV_SIZE_BYTES == 10 * 1024 * 1024
    login_as(create_user("recruiter"))
    candidate = await _create_candidate(async_client)

    too_big = await _upload(
        async_client, candidate["id"], _padded_pdf(settings.MAX_CV_SIZE_BYTES + 1)
    )
    assert too_big.status_code == 413
    assert "10 MB" in too_big.json()["detail"]
    assert committed_db.query(CvDocument).count() == 0
    assert _stored_files(tmp_path / "storage") == []

    at_limit = await _upload(async_client, candidate["id"], _padded_pdf(settings.MAX_CV_SIZE_BYTES))
    assert at_limit.status_code == 201
    assert at_limit.json()["size_bytes"] == settings.MAX_CV_SIZE_BYTES


@pytest.mark.asyncio
async def test_upload_filename_is_sanitised(
    async_client: AsyncClient,
    committed_db: Session,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A hostile filename is reduced to a bare name and never influences where the file goes."""
    login_as(create_user("recruiter"))
    candidate = await _create_candidate(async_client)

    cases = {
        "../../../etc/passwd": "passwd",
        "..\\..\\windows\\evil.pdf": "evil.pdf",
        "/abs/path/cv.pdf": "cv.pdf",
        "x" * 300 + ".pdf": "x" * 255,
        "   ": "cv.pdf",
    }
    for sent, expected in cases.items():
        response = await _upload(async_client, candidate["id"], PDF_BYTES, sent)
        assert response.status_code == 201, sent
        assert response.json()["original_filename"] == expected

    storage_root = (tmp_path / "storage").resolve()
    stored = _stored_files(storage_root)
    assert len(stored) == len(cases)
    for path in stored:
        assert path.resolve().parent.parent.parent == storage_root
        assert len(path.stem) == 64 and path.suffix == ".pdf"
    assert committed_db.query(CvDocument).count() == len(cases)


@pytest.mark.asyncio
async def test_status_and_download(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """The status endpoint follows the record, and the download returns the original bytes."""
    recruiter = create_user("recruiter")
    login_as(recruiter)
    candidate = await _create_candidate(async_client)
    document = (
        await _upload(async_client, candidate["id"], filename="Louise Vincent CV.pdf")
    ).json()
    document_url = f"{CANDIDATES_URL}/{candidate['id']}/cv/{document['id']}"

    status_response = await async_client.get(document_url)
    assert status_response.status_code == 200
    assert status_response.json() == document

    # The status endpoint reports whatever the processing pipeline writes later.
    committed_db.query(CvDocument).filter(CvDocument.id == uuid.UUID(document["id"])).update(
        {"status": "parsed"}
    )
    committed_db.commit()
    assert (await async_client.get(document_url)).json()["status"] == "parsed"

    download = await async_client.get(f"{document_url}/download")
    assert download.status_code == 200
    assert download.content == PDF_BYTES
    assert download.headers["content-type"] == "application/pdf"
    assert download.headers["content-disposition"] == (
        "attachment; filename*=UTF-8''Louise%20Vincent%20CV.pdf"
    )
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.headers["cache-control"] == "private, no-store"

    events = _cv_events(committed_db, document["id"])
    assert [e.action for e in events] == ["upload_cv", "download_cv"]
    assert events[1].user_id == recruiter.id
    assert events[1].details == {"candidate_id": candidate["id"]}

    # Unknown documents, and a real document under the wrong candidate, are 404.
    other = await _create_candidate(async_client)
    for url in (
        f"{CANDIDATES_URL}/{candidate['id']}/cv/{uuid.uuid4()}",
        f"{CANDIDATES_URL}/{other['id']}/cv/{document['id']}",
        f"{CANDIDATES_URL}/{uuid.uuid4()}/cv/{document['id']}",
    ):
        assert (await async_client.get(url)).status_code == 404
        assert (await async_client.get(f"{url}/download")).status_code == 404
    assert (await async_client.get(f"{CANDIDATES_URL}/{uuid.uuid4()}/cv")).status_code == 404
    assert (await _upload(async_client, str(uuid.uuid4()))).status_code == 404
    assert (await async_client.get(f"{document_url[:-4]}nope")).status_code == 422


@pytest.mark.asyncio
async def test_download_when_file_is_missing(
    async_client: AsyncClient,
    cv_storage: LocalDiskStorage,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A record whose file has gone is a 404 that does not reveal the storage key."""
    login_as(create_user("admin"))
    candidate = await _create_candidate(async_client)
    document = (await _upload(async_client, candidate["id"])).json()
    row = committed_db.get(CvDocument, uuid.UUID(document["id"]))
    assert row is not None
    cv_storage.delete(row.storage_key)

    response = await async_client.get(
        f"{CANDIDATES_URL}/{candidate['id']}/cv/{document['id']}/download"
    )
    assert response.status_code == 404
    assert row.storage_key not in response.text
    assert [e.action for e in _cv_events(committed_db, document["id"])] == ["upload_cv"]


@pytest.mark.asyncio
async def test_cv_endpoints_require_authentication(
    async_client: AsyncClient, tmp_path: Path
) -> None:
    """Every CV endpoint rejects anonymous callers, and nothing is stored."""
    base = f"{CANDIDATES_URL}/{uuid.uuid4()}/cv"
    responses = [
        await _upload(async_client, str(uuid.uuid4())),
        await async_client.get(base),
        await async_client.get(f"{base}/{uuid.uuid4()}"),
        await async_client.get(f"{base}/{uuid.uuid4()}/download"),
    ]
    assert [r.status_code for r in responses] == [401] * len(responses)
    assert _stored_files(tmp_path / "storage") == []


@pytest.mark.asyncio
async def test_viewer_can_read_but_not_upload(
    async_client: AsyncClient,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Viewers of the same organization can see status and download, but not upload."""
    recruiter = create_user("recruiter")
    viewer = create_user("viewer", org_id=recruiter.org_id)
    login_as(recruiter)
    candidate = await _create_candidate(async_client)
    document = (await _upload(async_client, candidate["id"])).json()
    base = f"{CANDIDATES_URL}/{candidate['id']}/cv"

    login_as(viewer)
    assert (await _upload(async_client, candidate["id"])).status_code == 403
    assert len(_stored_files(tmp_path / "storage")) == 1

    assert [doc["id"] for doc in (await async_client.get(base)).json()] == [document["id"]]
    assert (await async_client.get(f"{base}/{document['id']}")).json() == document
    download = await async_client.get(f"{base}/{document['id']}/download")
    assert download.status_code == 200
    assert download.content == PDF_BYTES


@pytest.mark.asyncio
async def test_files_are_not_served_from_a_public_path(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """The app mounts no static directory, and a storage key is not a URL."""
    assert not [route for route in app.routes if isinstance(route, Mount)]

    login_as(create_user("admin"))
    candidate = await _create_candidate(async_client)
    document = (await _upload(async_client, candidate["id"])).json()
    row = committed_db.get(CvDocument, uuid.UUID(document["id"]))
    assert row is not None
    filename = row.storage_key.rsplit("/", 1)[-1]

    # Guessable locations for the file, tried with a valid session.
    for prefix in ("", "/storage", "/static", "/uploads", "/files", "/media", "/api/v1"):
        for path in (row.storage_key, filename):
            response = await async_client.get(f"{prefix}/{path}")
            assert response.status_code == 404, f"{prefix}/{path}"
            assert response.content != PDF_BYTES


@pytest.mark.asyncio
async def test_deleting_a_candidate_removes_their_cv_files(
    async_client: AsyncClient,
    committed_db: Session,
    tmp_path: Path,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """A hard delete leaves no CV record or file behind, and keeps other candidates' files."""
    login_as(create_user("admin"))
    candidate = await _create_candidate(async_client)
    kept = await _create_candidate(async_client)
    for path in L5_PDFS[:2]:
        assert (await _upload(async_client, candidate["id"], path.read_bytes())).status_code == 201
    kept_document = (await _upload(async_client, kept["id"], L5_PDFS[2].read_bytes())).json()
    assert len(_stored_files(tmp_path / "storage")) == 3

    assert (await async_client.delete(f"{CANDIDATES_URL}/{candidate['id']}")).status_code == 204

    (row,) = committed_db.query(CvDocument).all()
    assert str(row.id) == kept_document["id"]
    (stored,) = _stored_files(tmp_path / "storage")
    assert stored.read_bytes() == L5_PDFS[2].read_bytes()

    event = committed_db.query(AuditEvent).filter(AuditEvent.action == "delete_candidate").one()
    assert event.details == {"applications_deleted": 0, "cv_files_deleted": 2}


def test_local_disk_storage(tmp_path: Path) -> None:
    """The local-disk backend round-trips data and refuses keys that leave its root."""
    storage = LocalDiskStorage(tmp_path / "root")
    outside = tmp_path / "outside.txt"
    outside.write_bytes(b"secret")

    storage.save("cvs/a/b.pdf", b"data")
    assert storage.exists("cvs/a/b.pdf")
    assert storage.read("cvs/a/b.pdf") == b"data"
    storage.delete("cvs/a/b.pdf")
    storage.delete("cvs/a/b.pdf")  # deleting twice is fine
    assert not storage.exists("cvs/a/b.pdf")
    with pytest.raises(StorageError):
        storage.read("cvs/a/b.pdf")

    for key in ("", ".", "../outside.txt", "cvs/../../outside.txt", str(outside)):
        for operation in (storage.read, storage.exists, storage.delete):
            with pytest.raises(StorageError):
                operation(key)
        with pytest.raises(StorageError):
            storage.save(key, b"overwritten")
    assert outside.read_bytes() == b"secret"


def test_storage_keys_are_random() -> None:
    """Keys are unguessable and unique per call."""
    org_id = uuid.uuid4()
    keys = {new_cv_storage_key(org_id) for _ in range(100)}
    assert len(keys) == 100
    for key in keys:
        prefix, name = key.rsplit("/", 1)
        assert prefix == f"cvs/{org_id}"
        assert len(name) == 64 + len(".pdf")
