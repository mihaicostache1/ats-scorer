"""Compute and publish a job's scores without holding locks during inference."""

import asyncio
import hashlib
import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from ats_scoring import EMBEDDING_MODEL_VERSION, MODEL_VERSION, ScoreExplanation, score_batch
from ats_scoring.parsed_cv import ParsedCV
from ats_scoring.schema import LEGACY_SCHEMA_VERSION, ScoreResult
from pydantic import ValidationError
from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.application import Application
from app.models.application_score import ApplicationScore
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.schemas.cv_document import CvStatus
from app.services.cv_parser import needs_review
from app.services.embedding_inputs import JOB_EMBEDDING_FIELDS, candidate_names, profile_name


@dataclass(frozen=True)
class _ApplicationInputs:
    id: uuid.UUID
    profile: dict[str, Any]
    names: list[str]
    embedding: tuple[float, ...] | None
    ready: bool
    inputs_hash: str
    current_id: uuid.UUID | None
    current_model: str | None
    current_hash: str | None

    def already_scored(self) -> bool:
        return self.current_model == MODEL_VERSION and self.current_hash == self.inputs_hash


def _digest(*values: Any) -> str:
    data = json.dumps(values, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _embedding(record: Candidate | Job) -> tuple[float, ...] | None:
    if record.embedding_model_version == EMBEDDING_MODEL_VERSION and record.embedding is not None:
        return tuple(float(value) for value in record.embedding)
    return None


def _ready(profile: dict[str, Any], cv_status: str | None) -> bool:
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


def _job_inputs(job: Job) -> tuple[dict[str, Any], tuple[float, ...] | None]:
    return (
        {name: getattr(job, name) for name in (*JOB_EMBEDDING_FIELDS, "min_experience_years")},
        _embedding(job),
    )


def _job(db: Session, job_id: uuid.UUID, org_id: uuid.UUID, *, lock: bool = False) -> Job | None:
    query = select(Job).where(Job.id == job_id, Job.org_id == org_id)
    return db.scalars(query.with_for_update() if lock else query).one_or_none()


def _applications(
    session: Session, job: Job, job_hash: str, ids: Sequence[uuid.UUID] | None = None
) -> list[_ApplicationInputs]:
    cv_status = (
        select(CvDocument.status)
        .where(CvDocument.org_id == job.org_id, CvDocument.candidate_id == Candidate.id)
        .order_by(CvDocument.created_at.desc(), CvDocument.id.desc())
        .limit(1)
        .scalar_subquery()
    )
    query = (
        select(
            Application.id,
            Candidate,
            cv_status,
            ApplicationScore.id,
            ApplicationScore.model_version,
            ApplicationScore.inputs_hash,
        )
        .select_from(Application)
        .join(Candidate, Candidate.id == Application.candidate_id)
        .outerjoin(
            ApplicationScore,
            and_(
                ApplicationScore.application_id == Application.id,
                ApplicationScore.org_id == Application.org_id,
                ApplicationScore.is_current,
            ),
        )
        .where(
            Application.job_id == job.id,
            Application.org_id == job.org_id,
            Candidate.org_id == job.org_id,
        )
        .order_by(Application.id)
    )
    if ids is not None:
        query = query.where(Application.id.in_(ids))

    inputs = []
    for id_, candidate, status, current_id, current_model, current_hash in session.execute(query):
        profile = candidate.parsed_data
        names = candidate_names(
            candidate.full_name,
            profile_name(candidate.parsed_data_original),
            candidate.embedding_name_aliases,
        )
        embedding = _embedding(candidate)
        ready = _ready(profile, status)
        inputs.append(
            _ApplicationInputs(
                id=id_,
                profile=profile,
                names=names,
                embedding=embedding,
                ready=ready,
                inputs_hash=_digest(job_hash, candidate.id.hex, profile, names, embedding, ready),
                current_id=current_id,
                current_model=current_model,
                current_hash=current_hash,
            )
        )
    return inputs


def _publish(
    sessions: sessionmaker[Session],
    org_id: uuid.UUID,
    job_id: uuid.UUID,
    job_hash: str,
    pending: dict[uuid.UUID, _ApplicationInputs],
    explanations: dict[uuid.UUID, ScoreExplanation],
) -> int:
    written = 0
    with sessions.begin() as db:
        # Serialize publishes for this job and prevent a requirements edit while committing.
        job = _job(db, job_id, org_id, lock=True)
        if job is None or _digest(*_job_inputs(job)) != job_hash:
            return 0

        # Lock candidates before applications, in a stable order across jobs. Profile saves
        # need the candidate lock, including parser transitions that make a CV scorable.
        ids = list(pending)
        targets = (
            Application.org_id == org_id,
            Application.job_id == job_id,
            Application.id.in_(ids),
        )
        db.execute(
            select(Candidate.id)
            .join(Application, Application.candidate_id == Candidate.id)
            .where(Candidate.org_id == org_id, *targets)
            .order_by(Candidate.id)
            .with_for_update(of=Candidate)
        ).all()
        db.execute(
            select(Application.id).where(*targets).order_by(Application.id).with_for_update()
        ).all()

        for current in _applications(db, job, job_hash, ids):
            original = pending[current.id]
            if current.inputs_hash != original.inputs_hash or current.already_scored():
                continue
            if current.current_id != original.current_id and current.current_model != MODEL_VERSION:
                # A publish from another scorer version superseded this task during inference.
                continue
            if current.current_id is not None:
                db.execute(
                    update(ApplicationScore)
                    .where(
                        ApplicationScore.id == current.current_id,
                        ApplicationScore.org_id == org_id,
                        ApplicationScore.application_id == current.id,
                    )
                    .values(is_current=False)
                )
            explanation = explanations.get(current.id)
            db.add(
                ApplicationScore(
                    org_id=org_id,
                    application_id=current.id,
                    status="scored" if explanation else "needs_review",
                    score=explanation.total if explanation else None,
                    band=explanation.band if explanation else None,
                    explanation=explanation.model_dump(mode="json") if explanation else None,
                    model_version=MODEL_VERSION,
                    inputs_hash=current.inputs_hash,
                )
            )
            written += 1
    return written


def score_job_applications(
    sessions: sessionmaker[Session], org_id: uuid.UUID, job_id: uuid.UUID
) -> int:
    """Score changed applications of one job and return the number of outcomes published."""
    with sessions() as db:
        job = _job(db, job_id, org_id)
        if job is None:
            return 0
        job_fields, job_embedding = _job_inputs(job)
        job_hash = _digest(job_fields, job_embedding)
        pending = {
            item.id: item for item in _applications(db, job, job_hash) if not item.already_scored()
        }
    if not pending:
        return 0

    eligible = [item for item in pending.values() if item.ready]
    explanations = {}
    if eligible:
        results: list[ScoreResult | None] = score_batch(
            job_fields,
            [item.profile for item in eligible],
            additional_names=[item.names for item in eligible],
            candidate_embeddings=[item.embedding for item in eligible],
            job_embedding=job_embedding,
        )
        for item, result in zip(eligible, results, strict=True):
            if result is None:
                continue
            explanation = ScoreExplanation.model_validate(result["explanation"])
            if (
                result["model_version"] != MODEL_VERSION
                or explanation.model_version != MODEL_VERSION
                or explanation.total != result["total"]
            ):
                raise ValueError("Score explanation disagrees with the score or model version")
            explanations[item.id] = explanation
    return _publish(sessions, org_id, job_id, job_hash, pending, explanations)


async def score_job(
    ctx: dict[str, Any], org_id: str, job_id: str, model_version: str = MODEL_VERSION
) -> int:
    """Arq task for a tenant's job. The enqueuer can pin the scorer version for a rollout."""
    if model_version != MODEL_VERSION:
        return 0
    sessions: sessionmaker[Session] = ctx.get("sessions") or SessionLocal
    return await asyncio.to_thread(
        score_job_applications, sessions, uuid.UUID(org_id), uuid.UUID(job_id)
    )
