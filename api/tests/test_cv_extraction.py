"""CV text extraction job tests.

The job function is called directly, so no Redis and no running worker are needed.
"""

import os
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pymupdf
import pytest
from arq import Retry
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit_event import AuditEvent
from app.models.cv_document import CvDocument
from app.models.user import User
from app.services import cv_extraction
from app.services.cv_extraction import extract_cv_text
from app.services.job_queue import (
    EXTRACT_CV_TEXT_JOB,
    ArqJobQueue,
    QueueUnavailableError,
)
from app.services.pdf_text import ExtractionResult, OcrUnavailableError, extract_text
from app.services.storage import LocalDiskStorage
from app.worker import WorkerSettings
from tests.conftest import RecordingJobQueue

CANDIDATES_URL = "/api/v1/candidates"

# One CV per layout from the L-5 generator (seed 42): classic, two-column, table, plain.
FIXTURES = Path(__file__).parent / "fixtures" / "cvs"
L5_PDFS = ["C001.pdf", "C002.pdf", "C003.pdf", "C005.pdf"]
PDF_BYTES = (FIXTURES / "C001.pdf").read_bytes()
# Passes the upload check (PDF header and end marker) but is not a readable PDF.
CORRUPT_PDF = b"%PDF-1.4\n" + os.urandom(4000) + b"\n%%EOF\n"

Uploader = Callable[..., Any]


@pytest.fixture
def upload(
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> Uploader:
    """Log in as a recruiter of a new org and return a function that uploads a CV."""
    login_as(create_user("recruiter"))

    async def _upload(data: bytes = PDF_BYTES) -> dict[str, Any]:
        candidate = await async_client.post(
            CANDIDATES_URL,
            json={"full_name": "Test Person", "email": f"{uuid.uuid4().hex[:8]}@example.com"},
        )
        assert candidate.status_code == 201, candidate.text
        response = await async_client.post(
            f"{CANDIDATES_URL}/{candidate.json()['id']}/cv",
            files={"file": ("cv.pdf", data, "application/pdf")},
        )
        assert response.status_code == 201, response.text
        document: dict[str, Any] = response.json()
        return document

    return _upload


def _url(document: dict[str, Any]) -> str:
    return f"{CANDIDATES_URL}/{document['candidate_id']}/cv/{document['id']}"


def _row(db: Session, document: dict[str, Any]) -> CvDocument:
    db.expire_all()
    row = db.get(CvDocument, uuid.UUID(document["id"]))
    assert row is not None
    return row


async def _run(storage: LocalDiskStorage, document: dict[str, Any], job_try: int = 1) -> str:
    """Run the job the way the worker would, with the test's storage."""
    return await extract_cv_text({"storage": storage, "job_try": job_try}, document["id"])


def _slow_extraction(data: bytes) -> ExtractionResult:
    time.sleep(0.5)
    return extract_text(data, ocr=None)


@pytest.mark.asyncio
async def test_upload_queues_an_extraction_job(
    upload: Uploader, job_queue: RecordingJobQueue
) -> None:
    """Uploading a CV queues exactly one job for it and leaves it queued."""
    document = await upload()

    assert job_queue.cv_extractions == [uuid.UUID(document["id"])]
    assert document["status"] == "queued"
    assert document["attempts"] == 0
    assert document["page_count"] is None
    assert document["ocr_used"] is False
    assert document["error_code"] is None
    assert document["error_message"] is None
    assert document["processed_at"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("name", L5_PDFS)
async def test_every_l5_layout_is_extracted(
    name: str,
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
) -> None:
    """The job takes each L-5 layout from queued to extracted and stores its text."""
    document = await upload((FIXTURES / name).read_bytes())

    assert await _run(cv_storage, document) == "extracted"

    status = (await async_client.get(_url(document))).json()
    assert status["status"] == "extracted"
    assert status["page_count"] == 1
    assert status["ocr_used"] is False
    assert status["attempts"] == 1
    assert status["error_code"] is None
    assert status["error_message"] is None
    assert status["processed_at"] is not None
    # The text is stored but is not part of the status response.
    assert "extracted_text" not in status

    row = _row(committed_db, document)
    assert row.extracted_text is not None
    assert len(row.extracted_text) > 500
    assert "@example." in row.extracted_text


@pytest.mark.asyncio
async def test_corrupt_pdf_fails_without_crashing_the_worker(
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
) -> None:
    """A corrupt PDF ends as failed with a reason; the job returns and the next one works."""
    corrupt = await upload(CORRUPT_PDF)
    good = await upload()

    # No exception and no retry: trying a damaged file again cannot help.
    assert await _run(cv_storage, corrupt) == "failed"

    status = (await async_client.get(_url(corrupt))).json()
    assert status["status"] == "failed"
    assert status["error_code"] == "invalid_pdf"
    assert status["error_message"] == "The file is damaged and could not be opened as a PDF."
    assert status["attempts"] == 1
    assert status["processed_at"] is not None
    assert _row(committed_db, corrupt).extracted_text is None

    assert await _run(cv_storage, good) == "extracted"
    assert (await async_client.get(_url(good))).json()["status"] == "extracted"


@pytest.mark.asyncio
async def test_scanned_pdf_is_extracted_with_ocr(
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A scanned CV goes through OCR, and a missing OCR engine is a clear failure."""
    with pymupdf.open(stream=PDF_BYTES, filetype="pdf") as original:
        pixmap = original[0].get_pixmap(dpi=72)
    with pymupdf.open() as scan:
        page = scan.new_page(width=595, height=842)
        page.insert_image(page.rect, pixmap=pixmap)
        scanned = scan.tobytes(deflate=True)

    def with_ocr(data: bytes) -> ExtractionResult:
        return extract_text(data, ocr=lambda png: "Text read from the scanned page. " * 5)

    def without_ocr(data: bytes) -> ExtractionResult:
        def missing(png: bytes) -> str:
            raise OcrUnavailableError("Tesseract is not installed")

        return extract_text(data, ocr=missing)

    document = await upload(scanned)
    monkeypatch.setattr(cv_extraction, "extract_text", with_ocr)
    assert await _run(cv_storage, document) == "extracted"
    status = (await async_client.get(_url(document))).json()
    assert status["ocr_used"] is True
    assert status["page_count"] == 1
    extracted = _row(committed_db, document).extracted_text
    assert extracted is not None and extracted.startswith("Text read from the scanned page.")

    document = await upload(scanned)
    monkeypatch.setattr(cv_extraction, "extract_text", without_ocr)
    assert await _run(cv_storage, document) == "failed"
    status = (await async_client.get(_url(document))).json()
    assert status["error_code"] == "ocr_unavailable"
    assert "OCR could not be run" in status["error_message"]


@pytest.mark.asyncio
async def test_timeout_is_retried_then_fails(
    upload: Uploader,
    async_client: AsyncClient,
    cv_storage: LocalDiskStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A job over its time limit is retried with a growing delay, then failed for good."""
    assert settings.CV_EXTRACTION_MAX_TRIES == 3
    monkeypatch.setattr(settings, "CV_EXTRACTION_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(cv_extraction, "extract_text", _slow_extraction)
    document = await upload()

    for job_try in (1, 2):
        with pytest.raises(Retry) as retry:
            await _run(cv_storage, document, job_try=job_try)
        # Arq keeps the delay in milliseconds.
        delay_ms = settings.CV_EXTRACTION_RETRY_DELAY_SECONDS * job_try * 1000
        assert retry.value.defer_score == delay_ms

        waiting = (await async_client.get(_url(document))).json()
        assert waiting["status"] == "queued"
        assert waiting["attempts"] == job_try
        assert waiting["error_code"] == "timeout"
        assert waiting["error_message"] == "Text extraction took longer than 0.05 seconds."
        assert waiting["processed_at"] is None

    # The last allowed attempt gives up instead of asking for another retry.
    assert await _run(cv_storage, document, job_try=3) == "failed"
    failed = (await async_client.get(_url(document))).json()
    assert failed["status"] == "failed"
    assert failed["attempts"] == 3
    assert failed["error_code"] == "timeout"
    assert failed["error_message"] == (
        "Text extraction took longer than 0.05 seconds. Gave up after 3 attempts."
    )
    assert failed["processed_at"] is not None


@pytest.mark.asyncio
async def test_retry_succeeds_after_a_passing_failure(
    upload: Uploader,
    async_client: AsyncClient,
    cv_storage: LocalDiskStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unexpected error is retried, and a later success clears the recorded error."""
    document = await upload()

    def broken(data: bytes) -> ExtractionResult:
        raise RuntimeError("disk hiccup")

    with monkeypatch.context() as patched:
        patched.setattr(cv_extraction, "extract_text", broken)
        with pytest.raises(Retry):
            await _run(cv_storage, document, job_try=1)
    waiting = (await async_client.get(_url(document))).json()
    assert waiting["status"] == "queued"
    assert waiting["error_code"] == "internal_error"
    # Internal details are logged, not shown to users.
    assert "disk hiccup" not in waiting["error_message"]

    assert await _run(cv_storage, document, job_try=2) == "extracted"
    done = (await async_client.get(_url(document))).json()
    assert done["status"] == "extracted"
    assert done["attempts"] == 2
    assert done["error_code"] is None
    assert done["error_message"] is None


@pytest.mark.asyncio
async def test_unexpected_error_fails_after_the_last_attempt(
    upload: Uploader,
    async_client: AsyncClient,
    cv_storage: LocalDiskStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An error that never goes away ends as failed, without raising out of the job."""
    document = await upload()

    def broken(data: bytes) -> ExtractionResult:
        raise RuntimeError("still broken")

    monkeypatch.setattr(cv_extraction, "extract_text", broken)
    for job_try in (1, 2):
        with pytest.raises(Retry):
            await _run(cv_storage, document, job_try=job_try)
    assert await _run(cv_storage, document, job_try=3) == "failed"

    failed = (await async_client.get(_url(document))).json()
    assert failed["status"] == "failed"
    assert failed["error_code"] == "internal_error"
    assert failed["error_message"].endswith("Gave up after 3 attempts.")


@pytest.mark.asyncio
async def test_missing_file_fails_with_a_reason(
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
) -> None:
    """A record whose file is gone from storage fails at once."""
    document = await upload()
    cv_storage.delete(_row(committed_db, document).storage_key)

    assert await _run(cv_storage, document) == "failed"
    status = (await async_client.get(_url(document))).json()
    assert status["error_code"] == "file_missing"
    assert status["error_message"] == "The uploaded file could not be found in storage."


@pytest.mark.asyncio
async def test_job_skips_what_it_should_not_touch(
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Unknown, finished and deleted documents are skipped; an interrupted one is resumed."""
    assert await extract_cv_text({"storage": cv_storage}, str(uuid.uuid4())) == "skipped"

    # Already extracted: a duplicate job changes nothing.
    done = await upload()
    assert await _run(cv_storage, done) == "extracted"
    before = (await async_client.get(_url(done))).json()
    assert await _run(cv_storage, done) == "skipped"
    assert (await async_client.get(_url(done))).json() == before

    # Left in "extracting" by a worker that stopped mid-job: picked up again.
    interrupted = await upload()
    row = _row(committed_db, interrupted)
    row.status, row.attempts = "extracting", 1
    committed_db.commit()
    assert await _run(cv_storage, interrupted, job_try=2) == "extracted"
    assert (await async_client.get(_url(interrupted))).json()["attempts"] == 2

    # The candidate was deleted while the job was waiting in the queue.
    orphan = await upload()
    row = _row(committed_db, orphan)
    admin = create_user("admin", org_id=row.org_id)
    login_as(admin)
    deleted = await async_client.delete(f"{CANDIDATES_URL}/{orphan['candidate_id']}")
    assert deleted.status_code == 204
    assert await _run(cv_storage, orphan) == "skipped"


@pytest.mark.asyncio
async def test_upload_when_the_queue_is_down(
    upload: Uploader,
    async_client: AsyncClient,
    job_queue: RecordingJobQueue,
) -> None:
    """If the job cannot be queued the upload is kept and marked failed, ready to retry."""
    job_queue.available = False
    document = await upload()

    assert document["status"] == "failed"
    assert document["error_code"] == "queue_unavailable"
    assert "could not be queued" in document["error_message"]
    assert job_queue.cv_extractions == []
    # The file is still there to be processed later.
    assert (await async_client.get(f"{_url(document)}/download")).status_code == 200

    # Still down: the retry reports the same failure instead of pretending to queue.
    still_down = await async_client.post(f"{_url(document)}/retry")
    assert still_down.status_code == 200
    assert still_down.json()["status"] == "failed"
    assert still_down.json()["error_code"] == "queue_unavailable"

    job_queue.available = True
    retried = await async_client.post(f"{_url(document)}/retry")
    assert retried.status_code == 200
    assert retried.json()["status"] == "queued"
    assert retried.json()["error_code"] is None
    assert job_queue.cv_extractions == [uuid.UUID(document["id"])]


@pytest.mark.asyncio
async def test_retry_endpoint(
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
    job_queue: RecordingJobQueue,
) -> None:
    """A failed document is reset and queued again; an extracted one cannot be retried."""
    failed = await upload(CORRUPT_PDF)
    assert await _run(cv_storage, failed) == "failed"
    job_queue.cv_extractions.clear()

    response = await async_client.post(f"{_url(failed)}/retry")
    assert response.status_code == 200
    reset = response.json()
    assert reset["status"] == "queued"
    assert reset["attempts"] == 0
    assert reset["error_code"] is None
    assert reset["error_message"] is None
    assert reset["processed_at"] is None
    assert job_queue.cv_extractions == [uuid.UUID(failed["id"])]

    events = (
        committed_db.query(AuditEvent)
        .filter(AuditEvent.target_id == uuid.UUID(failed["id"]), AuditEvent.action == "retry_cv")
        .all()
    )
    assert [e.details for e in events] == [
        {"candidate_id": failed["candidate_id"], "error_code": "invalid_pdf"}
    ]

    # Still waiting: queued again as it is (recovers a lost job), with no new audit event.
    again = await async_client.post(f"{_url(failed)}/retry")
    assert again.status_code == 200
    assert again.json() == reset
    assert len(job_queue.cv_extractions) == 2
    assert committed_db.query(AuditEvent).filter(AuditEvent.action == "retry_cv").count() == 1

    done = await upload()
    assert await _run(cv_storage, done) == "extracted"
    refused = await async_client.post(f"{_url(done)}/retry")
    assert refused.status_code == 409
    assert "extracted" in refused.json()["detail"]

    missing = f"{CANDIDATES_URL}/{done['candidate_id']}/cv/{uuid.uuid4()}/retry"
    assert (await async_client.post(missing)).status_code == 404


@pytest.mark.asyncio
async def test_retry_permissions(
    upload: Uploader,
    async_client: AsyncClient,
    committed_db: Session,
    cv_storage: LocalDiskStorage,
    job_queue: RecordingJobQueue,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    """Viewers, other organizations and anonymous callers cannot retry a document."""
    document = await upload(CORRUPT_PDF)
    assert await _run(cv_storage, document) == "failed"
    job_queue.cv_extractions.clear()
    retry_url = f"{_url(document)}/retry"
    org_id = _row(committed_db, document).org_id

    login_as(create_user("viewer", org_id=org_id))
    assert (await async_client.post(retry_url)).status_code == 403

    login_as(create_user("admin"))  # an admin of another organization
    assert (await async_client.post(retry_url)).status_code == 404

    async_client.cookies.clear()
    assert (await async_client.post(retry_url)).status_code == 401

    assert job_queue.cv_extractions == []
    assert _row(committed_db, document).status == "failed"


def test_worker_settings() -> None:
    """The worker registers the job under the name the API enqueues, with retries and a timeout."""
    (job,) = WorkerSettings.functions
    assert job.name == EXTRACT_CV_TEXT_JOB == "extract_cv_text"
    assert job.coroutine is extract_cv_text
    assert job.max_tries == settings.CV_EXTRACTION_MAX_TRIES
    # Arq's own limit comes after the job's, so the job records the timeout itself.
    assert job.timeout_s is not None
    assert job.timeout_s > settings.CV_EXTRACTION_TIMEOUT_SECONDS
    assert job.keep_result_s == 0


def test_enqueue_without_redis_raises_queue_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """With Redis unreachable the real queue fails fast with the error the API handles."""
    monkeypatch.setattr(settings, "REDIS_URL", "redis://127.0.0.1:1/0")
    started = time.monotonic()

    with pytest.raises(QueueUnavailableError):
        ArqJobQueue().enqueue_cv_extraction(uuid.uuid4())
    assert time.monotonic() - started < 10
