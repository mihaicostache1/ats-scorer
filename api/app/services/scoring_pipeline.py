"""Compute and publish a job's scores without holding locks during inference."""

import asyncio
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from arq import Retry
from ats_scoring import MODEL_VERSION, ScoreExplanation, score_batch
from ats_scoring.schema import ScoreResult
from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.logging import logger
from app.db.session import SessionLocal
from app.models.application import Application
from app.models.application_score import ApplicationScore
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.services.scoring_inputs import (
    PROCESSING_CV_STATUSES,
    candidate_inputs,
    job_inputs,
    scoring_digest,
)

_VERSION_RETRY_DELAY_SECONDS = 30


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
        # Apply this on both reads so a CV uploaded during inference also defers publication.
        if status in PROCESSING_CV_STATUSES:
            continue
        snapshot = candidate_inputs(candidate, status, job_hash)
        inputs.append(
            _ApplicationInputs(
                id=id_,
                profile=snapshot.profile,
                names=snapshot.names,
                embedding=snapshot.embedding,
                ready=snapshot.ready,
                inputs_hash=snapshot.inputs_hash,
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
        if job is None or scoring_digest(*job_inputs(job)) != job_hash:
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
        job_fields, job_embedding = job_inputs(job)
        job_hash = scoring_digest(job_fields, job_embedding)
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
            try:
                explanation = ScoreExplanation.model_validate(result["explanation"])
                if (
                    result["model_version"] != MODEL_VERSION
                    or explanation.model_version != MODEL_VERSION
                    or explanation.total != result["total"]
                ):
                    raise ValueError("Score explanation disagrees with the score or model version")
            except (KeyError, ValueError):
                logger.error(
                    "Invalid score explanation for job_id=%s application_id=%s", job_id, item.id
                )
                raise
            explanations[item.id] = explanation
    return _publish(sessions, org_id, job_id, job_hash, pending, explanations)


async def score_job(ctx: dict[str, Any], org_id: str, job_id: str, model_version: str) -> int:
    """Arq task for a tenant's job pinned to the model version selected by the enqueuer."""
    if model_version != MODEL_VERSION:
        logger.warning(
            "Deferring scoring for job_id=%s requested_model=%s worker_model=%s",
            job_id,
            model_version,
            MODEL_VERSION,
        )
        raise Retry(defer=_VERSION_RETRY_DELAY_SECONDS)
    sessions: sessionmaker[Session] = ctx.get("sessions") or SessionLocal
    return await asyncio.to_thread(
        score_job_applications, sessions, uuid.UUID(org_id), uuid.UUID(job_id)
    )
