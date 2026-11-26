"""Canonical inputs and fingerprints shared by score publication and reads."""

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from ats_scoring import EMBEDDING_MODEL_VERSION
from ats_scoring.parsed_cv import ParsedCV
from ats_scoring.schema import LEGACY_SCHEMA_VERSION
from pydantic import ValidationError

from app.core.config import settings
from app.models.candidate import Candidate
from app.models.job import Job
from app.schemas.cv_document import CvStatus
from app.services.cv_parser import needs_review
from app.services.embedding_inputs import JOB_EMBEDDING_FIELDS, candidate_names, profile_name

PROCESSING_CV_STATUSES = (
    CvStatus.QUEUED.value,
    CvStatus.EXTRACTING.value,
    CvStatus.EXTRACTED.value,
)


@dataclass(frozen=True)
class CandidateInputs:
    profile: dict[str, Any]
    names: list[str]
    embedding: tuple[float, ...] | None
    ready: bool
    inputs_hash: str


def scoring_digest(*values: Any) -> str:
    data = json.dumps(values, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def scoring_embedding(record: Candidate | Job) -> tuple[float, ...] | None:
    if record.embedding_model_version == EMBEDDING_MODEL_VERSION and record.embedding is not None:
        return tuple(float(value) for value in record.embedding)
    return None


def profile_ready(profile: dict[str, Any], cv_status: str | None) -> bool:
    if not isinstance(profile, dict) or not profile:
        return False
    if cv_status not in (None, CvStatus.PARSED.value):
        return False
    if profile.get("schema_version") in (None, LEGACY_SCHEMA_VERSION):
        # The scorer also supports draft profiles with plain-string skills.
        confidence = profile.get("confidence", {})
        return isinstance(confidence, dict) and all(
            not isinstance(value, bool)
            and isinstance(value, int | float)
            and settings.CV_REVIEW_CONFIDENCE_THRESHOLD <= value <= 1
            for value in confidence.values()
        )
    try:
        parsed = ParsedCV.model_validate(profile)
    except ValidationError:
        return False
    return not needs_review(parsed, settings.CV_REVIEW_CONFIDENCE_THRESHOLD)


def job_inputs(job: Job) -> tuple[dict[str, Any], tuple[float, ...] | None]:
    return (
        {name: getattr(job, name) for name in (*JOB_EMBEDDING_FIELDS, "min_experience_years")},
        scoring_embedding(job),
    )


def candidate_inputs(candidate: Candidate, status: str | None, job_hash: str) -> CandidateInputs:
    profile = candidate.parsed_data
    names = candidate_names(
        candidate.full_name,
        profile_name(candidate.parsed_data_original),
        candidate.embedding_name_aliases,
    )
    embedding = scoring_embedding(candidate)
    ready = profile_ready(profile, status)
    return CandidateInputs(
        profile,
        names,
        embedding,
        ready,
        scoring_digest(job_hash, candidate.id.hex, profile, names, embedding, ready),
    )
