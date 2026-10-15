"""CV document schemas."""

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class CvStatus(StrEnum):
    """Processing states of an uploaded CV. Uploads start as ``queued``."""

    QUEUED = "queued"
    EXTRACTING = "extracting"
    EXTRACTED = "extracted"
    PARSED = "parsed"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"


class CvDocumentResponse(BaseModel):
    """An uploaded CV and its processing status. The storage location is never exposed."""

    id: uuid.UUID
    org_id: uuid.UUID
    candidate_id: uuid.UUID
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    status: str
    page_count: int | None
    ocr_used: bool
    error_code: str | None
    error_message: str | None
    attempts: int
    processed_at: datetime | None
    uploaded_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
