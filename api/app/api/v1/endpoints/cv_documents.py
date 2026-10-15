"""CV document API endpoints: upload, status and download of a candidate's CV files."""

import hashlib
import uuid
from pathlib import PureWindowsPath
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_recruiter_or_admin, get_current_user, get_tenant_db
from app.core.logging import logger
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.user import User
from app.schemas.cv_document import CvDocumentResponse, CvStatus
from app.services.audit_service import log_audit_event
from app.services.job_queue import JobQueue, QueueUnavailableError, get_job_queue
from app.services.storage import Storage, StorageError, get_storage, new_cv_storage_key

router = APIRouter(prefix="/candidates/{id}/cv", tags=["CV Documents"])

_PDF_CONTENT_TYPE = "application/pdf"
_PDF_HEADER = b"%PDF-"
_PDF_EOF_MARKER = b"%%EOF"
# PDF readers look for the end-of-file marker in the last 1024 bytes.
_PDF_EOF_WINDOW = 1024
_DEFAULT_FILENAME = "cv.pdf"
_RETRYABLE = (CvStatus.FAILED.value, CvStatus.QUEUED.value, CvStatus.EXTRACTING.value)


def _is_pdf(data: bytes) -> bool:
    """Check the file's content: a PDF header at the start and an EOF marker at the end."""
    return data.startswith(_PDF_HEADER) and _PDF_EOF_MARKER in data[-_PDF_EOF_WINDOW:]


def _safe_filename(filename: str | None) -> str:
    """Reduce a client-supplied filename to a bare, printable name for display only."""
    # PureWindowsPath splits on both "/" and "\", whichever the client's OS used.
    name = PureWindowsPath(filename or "").name
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:255] or _DEFAULT_FILENAME


def _enqueue_extraction(db: Session, queue: JobQueue, document: CvDocument) -> None:
    """Hand the document to the worker; if the queue is down, fail it with a clear reason."""
    try:
        queue.enqueue_cv_extraction(document.id)
    except QueueUnavailableError:
        logger.exception("Could not queue cv_document=%s for extraction", document.id)
        document.status = CvStatus.FAILED.value
        document.error_code = "queue_unavailable"
        document.error_message = (
            "The file was saved but could not be queued for processing. Retry it later."
        )
        db.commit()
        db.refresh(document)


def _get_candidate_or_404(db: Session, candidate_id: uuid.UUID) -> Candidate:
    """Load a candidate through the tenant-scoped session; other orgs' candidates look missing."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate with ID '{candidate_id}' was not found.",
        )
    return candidate


def _get_document_or_404(db: Session, candidate_id: uuid.UUID, cv_id: uuid.UUID) -> CvDocument:
    """Load one of the candidate's CV documents through the tenant-scoped session."""
    _get_candidate_or_404(db, candidate_id)
    document = (
        db.query(CvDocument)
        .filter(CvDocument.id == cv_id, CvDocument.candidate_id == candidate_id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV document with ID '{cv_id}' was not found.",
        )
    return document


@router.post(
    "",
    response_model=CvDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF CV for a candidate",
)
def upload_cv(
    id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_tenant_db),
    storage: Storage = Depends(get_storage),
    queue: JobQueue = Depends(get_job_queue),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> CvDocument:
    """Store a PDF CV and queue it for processing. Admin or recruiter only.

    The file is judged by its content, not its name or declared type.
    """
    candidate = _get_candidate_or_404(db, id)

    data = file.file.read(settings.MAX_CV_SIZE_BYTES + 1)
    if len(data) > settings.MAX_CV_SIZE_BYTES:
        limit_mb = settings.MAX_CV_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"The file is larger than the {limit_mb} MB limit.",
        )
    if not _is_pdf(data):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted.",
        )

    document = CvDocument(
        id=uuid.uuid4(),
        org_id=candidate.org_id,
        candidate_id=candidate.id,
        storage_key=new_cv_storage_key(candidate.org_id),
        original_filename=_safe_filename(file.filename),
        content_type=_PDF_CONTENT_TYPE,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        status=CvStatus.QUEUED.value,
        uploaded_by=current_user.id,
    )
    db.add(document)
    # The filename stays out of the audit log: it often contains the candidate's name.
    log_audit_event(
        db=db,
        org_id=document.org_id,
        action="upload_cv",
        target_entity="cv_document",
        target_id=document.id,
        user_id=current_user.id,
        details={"candidate_id": str(candidate.id), "size_bytes": document.size_bytes},
        request=request,
    )
    storage.save(document.storage_key, data)
    try:
        db.commit()
    except Exception:
        db.rollback()
        # Do not leave a file behind that no record points to.
        storage.delete(document.storage_key)
        raise
    db.refresh(document)
    # Queued only after the commit, so the worker always finds the record.
    _enqueue_extraction(db, queue, document)
    return document


@router.get(
    "",
    response_model=list[CvDocumentResponse],
    summary="List a candidate's CV documents",
)
def list_cv_documents(
    id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> list[CvDocument]:
    """Return the candidate's CV documents with their status, newest first."""
    candidate = _get_candidate_or_404(db, id)
    return (
        db.query(CvDocument)
        .filter(CvDocument.candidate_id == candidate.id)
        .order_by(CvDocument.created_at.desc(), CvDocument.id)
        .all()
    )


@router.get(
    "/{cv_id}",
    response_model=CvDocumentResponse,
    summary="Get a CV document's processing status",
)
def get_cv_document(
    id: uuid.UUID,
    cv_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _current_user: User = Depends(get_current_user),
) -> CvDocument:
    """Return one CV document, including its processing status."""
    return _get_document_or_404(db, id, cv_id)


@router.post(
    "/{cv_id}/retry",
    response_model=CvDocumentResponse,
    summary="Queue a CV document for text extraction again",
)
def retry_cv_extraction(
    id: uuid.UUID,
    cv_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_tenant_db),
    queue: JobQueue = Depends(get_job_queue),
    current_user: User = Depends(get_current_recruiter_or_admin),
) -> CvDocument:
    """Queue a failed document again, with a fresh set of attempts. Admin or recruiter only.

    A document still waiting or in progress is queued again as it is, which recovers
    one whose job was lost. A document that already has its text returns 409.
    """
    document = _get_document_or_404(db, id, cv_id)
    if document.status not in _RETRYABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A CV document with status '{document.status}' cannot be retried.",
        )

    if document.status == CvStatus.FAILED.value:
        log_audit_event(
            db=db,
            org_id=document.org_id,
            action="retry_cv",
            target_entity="cv_document",
            target_id=document.id,
            user_id=current_user.id,
            details={
                "candidate_id": str(document.candidate_id),
                "error_code": document.error_code,
            },
            request=request,
        )
        document.status = CvStatus.QUEUED.value
        document.error_code = None
        document.error_message = None
        document.attempts = 0
        document.processed_at = None
        db.commit()
        db.refresh(document)

    _enqueue_extraction(db, queue, document)
    return document


@router.get(
    "/{cv_id}/download",
    summary="Download a CV file",
    response_class=Response,
    responses={200: {"content": {_PDF_CONTENT_TYPE: {}}}},
)
def download_cv(
    id: uuid.UUID,
    cv_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_tenant_db),
    storage: Storage = Depends(get_storage),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Return the stored PDF to a member of the organization that owns it.

    This endpoint is the only way to read a CV file, and each download is audited.
    """
    document = _get_document_or_404(db, id, cv_id)
    try:
        data = storage.read(document.storage_key)
    except StorageError:
        logger.error("Stored file is missing for cv_document=%s", document.id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"The file for CV document '{cv_id}' is not available.",
        ) from None

    log_audit_event(
        db=db,
        org_id=document.org_id,
        action="download_cv",
        target_entity="cv_document",
        target_id=document.id,
        user_id=current_user.id,
        details={"candidate_id": str(document.candidate_id)},
        request=request,
    )
    db.commit()

    return Response(
        content=data,
        media_type=_PDF_CONTENT_TYPE,
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(document.original_filename)}"
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
