"""The CV text extraction job run by the Arq worker.

Status flow: queued -> extracting -> extracted, or failed with an ``error_code``.

A failure the file itself causes (damaged, password-protected, no text) is final at
once. A failure that may pass (a timeout, an unexpected error) puts the document back
to ``queued`` and is retried, up to ``CV_EXTRACTION_MAX_TRIES`` attempts.
"""

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any, cast

from arq import Retry
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logging import logger
from app.db.session import SessionLocal
from app.models.cv_document import CvDocument
from app.schemas.cv_document import CvStatus
from app.services.pdf_text import ExtractionResult, PdfExtractionError, extract_text
from app.services.storage import Storage, StorageError, get_storage

# Statuses a job may pick up. ``extracting`` is included so that a job interrupted by
# a worker restart is processed again when Arq re-runs it.
_CLAIMABLE = (CvStatus.QUEUED.value, CvStatus.EXTRACTING.value)


class _TransientError(Exception):
    """A failure worth retrying."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _claim(sessions: sessionmaker[Session], document_id: uuid.UUID) -> str | None:
    """Mark the document as extracting and return its storage key, or None to skip it."""
    with sessions() as db:
        document = (
            db.query(CvDocument).filter(CvDocument.id == document_id).with_for_update().first()
        )
        if document is None or document.status not in _CLAIMABLE:
            return None
        document.status = CvStatus.EXTRACTING.value
        document.attempts += 1
        key = document.storage_key
        db.commit()
        return key


def _finish(sessions: sessionmaker[Session], document_id: uuid.UUID, **values: Any) -> bool:
    """Write the outcome of an attempt. Returns False if the document no longer exists."""
    with sessions() as db:
        updated = (
            db.query(CvDocument)
            .filter(CvDocument.id == document_id, CvDocument.status == CvStatus.EXTRACTING.value)
            .update(cast(dict[Any, Any], values), synchronize_session=False)
        )
        db.commit()
        return bool(updated)


def _mark_extracted(
    sessions: sessionmaker[Session], document_id: uuid.UUID, result: ExtractionResult
) -> bool:
    return _finish(
        sessions,
        document_id,
        status=CvStatus.EXTRACTED.value,
        extracted_text=result.text,
        page_count=result.page_count,
        ocr_used=result.ocr_used,
        error_code=None,
        error_message=None,
        processed_at=datetime.now(UTC),
    )


def _mark_failed(
    sessions: sessionmaker[Session], document_id: uuid.UUID, code: str, message: str
) -> bool:
    return _finish(
        sessions,
        document_id,
        status=CvStatus.FAILED.value,
        error_code=code,
        error_message=message,
        processed_at=datetime.now(UTC),
    )


def _mark_for_retry(
    sessions: sessionmaker[Session], document_id: uuid.UUID, code: str, message: str
) -> bool:
    return _finish(
        sessions,
        document_id,
        status=CvStatus.QUEUED.value,
        error_code=code,
        error_message=message,
    )


async def _extract(storage: Storage, storage_key: str) -> ExtractionResult:
    """Read the file and extract its text, with a time limit."""
    try:
        data = storage.read(storage_key)
    except StorageError as exc:
        raise PdfExtractionError(
            "file_missing", "The uploaded file could not be found in storage."
        ) from exc

    timeout = settings.CV_EXTRACTION_TIMEOUT_SECONDS
    try:
        # PyMuPDF and Tesseract block, so they run in a thread and the worker's
        # event loop stays free to enforce the time limit.
        return await asyncio.wait_for(asyncio.to_thread(extract_text, data), timeout)
    except TimeoutError as exc:
        raise _TransientError(
            "timeout", f"Text extraction took longer than {timeout:g} seconds."
        ) from exc


async def extract_cv_text(ctx: dict[str, Any], cv_document_id: str) -> str:
    """Arq job: extract the text of one CV document and record the outcome.

    Returns the document's resulting status, or ``skipped`` when there was nothing to
    do. Raises ``arq.Retry`` when the attempt failed for a reason that may pass.
    ``ctx`` may carry ``sessions`` and ``storage`` to replace the defaults.
    """
    sessions: sessionmaker[Session] = ctx.get("sessions") or SessionLocal
    storage: Storage = ctx.get("storage") or get_storage()
    job_try: int = ctx.get("job_try", 1)
    document_id = uuid.UUID(cv_document_id)

    try:
        storage_key = _claim(sessions, document_id)
        if storage_key is None:
            logger.info("Skipping cv_document=%s: missing or already processed", document_id)
            return "skipped"

        try:
            result = await _extract(storage, storage_key)
        except PdfExtractionError as exc:
            logger.warning("cv_document=%s failed: %s", document_id, exc.code)
            found = _mark_failed(sessions, document_id, exc.code, exc.message)
            return CvStatus.FAILED.value if found else "skipped"

        found = _mark_extracted(sessions, document_id, result)
        logger.info(
            "cv_document=%s extracted: pages=%s ocr_pages=%s chars=%s",
            document_id,
            result.page_count,
            result.ocr_pages,
            len(result.text),
        )
        return CvStatus.EXTRACTED.value if found else "skipped"

    except Exception as exc:
        if isinstance(exc, _TransientError):
            code, message = exc.code, exc.message
        else:
            logger.exception("Unexpected error extracting cv_document=%s", document_id)
            code, message = "internal_error", "An unexpected error occurred during extraction."

        final = job_try >= settings.CV_EXTRACTION_MAX_TRIES
        try:
            if final:
                message = f"{message} Gave up after {job_try} attempts."
                _mark_failed(sessions, document_id, code, message)
            else:
                _mark_for_retry(sessions, document_id, code, message)
        except Exception:
            # The database itself may be the problem; the retry below still happens.
            logger.exception("Could not record the outcome for cv_document=%s", document_id)

        if final:
            logger.error("cv_document=%s failed after %s attempts: %s", document_id, job_try, code)
            return CvStatus.FAILED.value
        # Wait longer before each further attempt.
        raise Retry(defer=settings.CV_EXTRACTION_RETRY_DELAY_SECONDS * job_try) from exc
