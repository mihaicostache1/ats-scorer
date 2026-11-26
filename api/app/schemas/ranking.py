"""Stored application score and ranking responses."""

import uuid
from datetime import datetime
from enum import StrEnum

from ats_scoring import ScoreExplanation
from ats_scoring.score_explanation import Band
from pydantic import BaseModel

from app.schemas.cv_document import CvStatus
from app.schemas.pagination import PaginationMeta


class RankingSort(StrEnum):
    SCORE = "score"
    APPLIED_AT = "applied_at"


class ScoreStatus(StrEnum):
    SCORED = "scored"
    NEEDS_MANUAL_REVIEW = "needs_manual_review"
    PENDING = "pending"
    RESCORING = "rescoring"


class ScoreSummary(BaseModel):
    status: ScoreStatus
    score: float | None
    band: Band | None
    model_version: str | None
    computed_at: datetime | None


class RankedCandidate(ScoreSummary):
    application_id: uuid.UUID
    candidate_id: uuid.UUID
    full_name: str
    stage_id: uuid.UUID
    stage_name: str
    cv_status: CvStatus | None
    applied_at: datetime
    experience_years: float | None


class RankedCandidatesPage(BaseModel):
    items: list[RankedCandidate]
    pagination: PaginationMeta


class RankedCandidatesResponse(BaseModel):
    ranked: RankedCandidatesPage
    needs_manual_review: RankedCandidatesPage
    unranked: RankedCandidatesPage
    advisory_note: str


class ScoreResponse(ScoreSummary):
    id: uuid.UUID | None
    application_id: uuid.UUID
    explanation: ScoreExplanation | None
