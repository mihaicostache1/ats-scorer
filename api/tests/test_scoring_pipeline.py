"""B-18: versioned application scoring and safe publication."""

import asyncio
import uuid
from collections.abc import Callable
from threading import Barrier
from typing import Any
from unittest.mock import Mock

import pytest
from arq import Retry
from ats_scoring import EMBEDDING_MODEL_VERSION, MODEL_VERSION, ScoreExplanation
from ats_scoring.config import DEFAULT_CONFIG
from ats_scoring.schema import ScoreResult, load_score_explanation_schema
from jsonschema import Draft202012Validator
from pydantic import ValidationError
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.application import Application
from app.models.application_score import ApplicationScore
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.models.pipeline_stage import PipelineStage
from app.models.user import User
from app.services import scoring_pipeline as pipeline
from app.services.job_queue import SCORE_JOB
from app.worker import WorkerSettings


def _job(db: Session, org_id: uuid.UUID) -> Job:
    job = Job(org_id=org_id, title="Engineer", description="Build Python services")
    db.add(job)
    db.flush()
    return job


def _application(
    db: Session,
    job: Job,
    *,
    status: str | None = "parsed",
    confidence: float = 1.0,
    profile: dict[str, Any] | None = None,
    embedding_version: str | None = None,
) -> Application:
    suffix = uuid.uuid4().hex
    email = f"{suffix}@example.com"
    candidate = Candidate(
        org_id=job.org_id,
        full_name="Jane Example",
        email=email,
        parsed_data=profile
        if profile is not None
        else {
            "schema_version": "1.1",
            "source": "parser",
            "contact": {"name": "Jane Example", "email": email},
            "skills": [{"raw": "Python", "normalized": "Python"}],
            "confidence": {"/skills/0/raw": confidence},
        },
        embedding_ready=True,
        embedding=_vector() if embedding_version else None,
        embedding_model_version=embedding_version,
    )
    db.add(candidate)
    db.flush()
    if status is not None:
        db.add(
            CvDocument(
                org_id=job.org_id,
                candidate_id=candidate.id,
                storage_key=f"{suffix}.pdf",
                original_filename="resume.pdf",
                content_type="application/pdf",
                size_bytes=100,
                sha256="a" * 64,
                status=status,
            )
        )
    stage_id = db.scalars(
        select(PipelineStage.id).where(
            PipelineStage.org_id == job.org_id, PipelineStage.stage_type == "applied"
        )
    ).one()
    application = Application(
        org_id=job.org_id, job_id=job.id, candidate_id=candidate.id, stage_id=stage_id
    )
    db.add(application)
    db.commit()
    return application


def _vector() -> list[float]:
    return [1.0] + [0.0] * (DEFAULT_CONFIG.embedding.dimensions - 1)


def _history(db: Session, application: Application) -> list[ApplicationScore]:
    db.expire_all()
    return list(
        db.scalars(
            select(ApplicationScore)
            .where(ApplicationScore.application_id == application.id)
            .order_by(ApplicationScore.computed_at)
        )
    )


async def test_registered_task_scores_a_job_and_sets_needs_review(
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org = create_user().org_id
    job = _job(committed_db, org)
    job.embedding = _vector()
    job.embedding_model_version = EMBEDDING_MODEL_VERSION
    scored = _application(committed_db, job, embedding_version=EMBEDDING_MODEL_VERSION)
    stale = _application(committed_db, job, embedding_version="older-model")
    failed = _application(committed_db, job, status="failed")
    low = _application(committed_db, job, confidence=0.4)
    empty = _application(committed_db, job, status=None, profile={"skills": []})

    actual = pipeline.score_batch
    calls = []

    def record(*args: Any, **kwargs: Any) -> list[ScoreResult | None]:
        calls.append((args, kwargs))
        return actual(*args, **kwargs)

    monkeypatch.setattr(pipeline, "score_batch", record)
    worker_task = next(fn for fn in WorkerSettings.functions if fn.name == SCORE_JOB)
    assert worker_task.max_tries == 5
    task = worker_task.coroutine
    ctx = {"sessions": sessionmaker(bind=db_engine)}
    with pytest.raises(TypeError, match="model_version"):
        await task(ctx, str(org), str(job.id))
    with monkeypatch.context() as older_worker:
        older_worker.setattr(pipeline, "MODEL_VERSION", "older-scorer")
        with pytest.raises(Retry) as retry:
            await task(ctx, str(org), str(job.id), MODEL_VERSION)
        assert retry.value.defer_score == 30_000
    assert await task(ctx, str(org), str(job.id), MODEL_VERSION) == 5
    assert await task(ctx, str(org), str(job.id), MODEL_VERSION) == 0
    [(args, kwargs)] = calls
    assert len(args[1]) == 3
    assert sum(vector is not None for vector in kwargs["candidate_embeddings"]) == 1
    assert kwargs["job_embedding"] == tuple(_vector())

    validator = Draft202012Validator(load_score_explanation_schema())
    for application, embedding_score in ((scored, 100.0), (stale, None)):
        [row] = _history(committed_db, application)
        assert row.status == "scored" and row.is_current
        assert row.score is not None
        validator.validate(row.explanation)
        explanation = ScoreExplanation.model_validate(row.explanation)
        assert (float(row.score), row.band, row.model_version) == (
            explanation.total,
            explanation.band,
            MODEL_VERSION,
        )
        assert explanation.model_version == MODEL_VERSION
        assert explanation.components[1].score == embedding_score
    for application in (failed, low, empty):
        [row] = _history(committed_db, application)
        assert row.status == "needs_review" and row.is_current
        assert row.score is row.band is row.explanation is None


@pytest.mark.parametrize("status", ["queued", "extracting", "extracted"])
def test_processing_cv_waits_until_parsed_before_writing_an_outcome(
    status: str,
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
) -> None:
    org = create_user().org_id
    job = _job(committed_db, org)
    application = _application(committed_db, job, status=status)
    sessions = sessionmaker(bind=db_engine)

    assert pipeline.score_job_applications(sessions, org, job.id) == 0
    assert _history(committed_db, application) == []

    document = committed_db.scalars(
        select(CvDocument).where(CvDocument.candidate_id == application.candidate_id)
    ).one()
    document.status = "parsed"
    committed_db.commit()
    assert pipeline.score_job_applications(sessions, org, job.id) == 1
    [row] = _history(committed_db, application)
    assert row.status == "scored" and row.is_current


async def test_concurrent_retries_keep_one_current_row_and_reverts_keep_history(
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org = create_user().org_id
    job = _job(committed_db, org)
    application = _application(committed_db, job)
    sessions = sessionmaker(bind=db_engine)
    actual = pipeline.score_batch
    barrier = Barrier(2, timeout=10)

    def parallel(*args: Any, **kwargs: Any) -> list[ScoreResult | None]:
        barrier.wait()
        return actual(*args, **kwargs)

    monkeypatch.setattr(pipeline, "score_batch", parallel)
    results = await asyncio.gather(
        pipeline.score_job({"sessions": sessions}, str(org), str(job.id), MODEL_VERSION),
        pipeline.score_job({"sessions": sessions}, str(org), str(job.id), MODEL_VERSION),
    )
    assert sorted(results) == [0, 1]
    monkeypatch.setattr(pipeline, "score_batch", actual)

    for requirements in (["Rust"], []):
        job.required_skills = requirements
        committed_db.commit()
        assert pipeline.score_job_applications(sessions, org, job.id) == 1
    first, second, third = _history(committed_db, application)
    assert [first.is_current, second.is_current, third.is_current] == [False, False, True]
    assert first.score == third.score != second.score
    assert first.inputs_hash == third.inputs_hash != second.inputs_hash
    assert first.explanation == third.explanation


def test_inference_cannot_publish_over_a_new_parse(
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org = create_user().org_id
    job = _job(committed_db, org)
    changed = _application(committed_db, job)
    steady = _application(committed_db, job)
    sessions = sessionmaker(bind=db_engine)
    actual = pipeline.score_batch

    def change_parse(*args: Any, **kwargs: Any) -> list[ScoreResult | None]:
        with sessions.begin() as db:
            document = db.scalars(
                select(CvDocument).where(CvDocument.candidate_id == changed.candidate_id)
            ).one()
            document.status = "needs_review"
        return actual(*args, **kwargs)

    monkeypatch.setattr(pipeline, "score_batch", change_parse)
    assert pipeline.score_job_applications(sessions, org, job.id) == 1
    assert not _history(committed_db, changed)
    assert _history(committed_db, steady)[0].status == "scored"
    assert pipeline.score_job_applications(sessions, org, job.id) == 1
    assert _history(committed_db, changed)[0].status == "needs_review"


def test_invalid_explanation_cannot_replace_current_score(
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org = create_user().org_id
    job = _job(committed_db, org)
    application = _application(committed_db, job)
    sessions = sessionmaker(bind=db_engine)
    assert pipeline.score_job_applications(sessions, org, job.id) == 1
    current_id = _history(committed_db, application)[0].id
    actual = pipeline.score_batch

    def invalid(*args: Any, **kwargs: Any) -> list[ScoreResult | None]:
        results = actual(*args, **kwargs)
        assert results[0] is not None
        del results[0]["explanation"]["summary"]
        return results

    monkeypatch.setattr(pipeline, "score_batch", invalid)
    log_error = Mock()
    monkeypatch.setattr(pipeline.logger, "error", log_error)
    job.required_skills = ["Rust"]
    committed_db.commit()
    with pytest.raises(ValidationError, match="summary"):
        pipeline.score_job_applications(sessions, org, job.id)
    log_error.assert_called_once_with(
        "Invalid score explanation for job_id=%s application_id=%s", job.id, application.id
    )
    [row] = _history(committed_db, application)
    assert row.id == current_id and row.is_current
