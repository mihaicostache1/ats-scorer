"""B-19 ranking and score detail against the PostgreSQL score history."""

import os
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any

import yaml
from ats_scoring import MODEL_VERSION
from ats_scoring.schema import load_score_explanation_example
from httpx import AsyncClient
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.main import app
from app.models.application import Application
from app.models.application_score import ApplicationScore
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.models.pipeline_stage import PipelineStage
from app.models.score import Score
from app.models.user import User
from app.services.scoring_inputs import candidate_inputs, job_inputs, scoring_digest


def _job(db: Session, user: User) -> Job:
    job = Job(
        org_id=user.org_id,
        title="Developer",
        description="Build APIs and databases",
        required_skills=["PostgreSQL", "Python"],
        preferred_skills=["Rust"],
    )
    db.add(job)
    db.commit()
    return job


def _stage(db: Session, job: Job, stage_type: str) -> uuid.UUID:
    return db.scalars(
        select(PipelineStage.id).where(
            PipelineStage.org_id == job.org_id, PipelineStage.stage_type == stage_type
        )
    ).one()


def _outcome(
    db: Session,
    job: Job,
    application_id: uuid.UUID,
    *,
    score: float | None,
    version: str = MODEL_VERSION,
    years: float | None = 5,
    skill: str = "PostgreSQL",
    is_current: bool = True,
    candidate: Candidate | None = None,
) -> dict[str, Any]:
    band = (
        None
        if score is None
        else "strong"
        if score >= 70
        else "moderate"
        if score >= 50
        else "weak"
    )
    explanation = None
    if score is not None:
        explanation = load_score_explanation_example("strong")
        explanation.update(model_version=version, total=score, band=band)
        explanation["matched_skills"] = [
            {"skill": skill, "requirement": "required", "cv_phrase": skill}
        ]
        explanation["experience"]["candidate_years"] = years
    if candidate is None:
        candidate = db.scalars(
            select(Candidate)
            .join(Application, Application.candidate_id == Candidate.id)
            .where(Application.id == application_id)
        ).one()
    return {
        "id": uuid.uuid4(),
        "org_id": job.org_id,
        "application_id": application_id,
        "status": "needs_review" if score is None else "scored",
        "score": score,
        "band": band,
        "explanation": explanation,
        "model_version": version,
        "inputs_hash": candidate_inputs(
            candidate, "parsed", scoring_digest(*job_inputs(job))
        ).inputs_hash,
        "is_current": is_current,
    }


def _application(
    db: Session,
    job: Job,
    name: str,
    *,
    stage: str = "applied",
    cv_status: str | None = "parsed",
    applied_days_ago: int = 0,
) -> uuid.UUID:
    candidate = Candidate(
        org_id=job.org_id,
        email=f"{uuid.uuid4().hex}@example.com",
        full_name=name,
        parsed_data={"experience_years": 100},  # filters use the stored score snapshot
    )
    db.add(candidate)
    db.flush()
    application = Application(
        org_id=job.org_id,
        job_id=job.id,
        candidate_id=candidate.id,
        stage_id=_stage(db, job, stage),
        applied_at=datetime.now(UTC) - timedelta(days=applied_days_ago),
    )
    if cv_status is not None:
        db.add(
            CvDocument(
                org_id=job.org_id,
                candidate_id=candidate.id,
                storage_key=f"{uuid.uuid4()}.pdf",
                original_filename="resume.pdf",
                content_type="application/pdf",
                size_bytes=100,
                sha256="a" * 64,
                status=cv_status,
            )
        )
    db.add(application)
    db.flush()
    return application.id


def _ids(response: dict[str, Any], group: str = "ranked") -> list[str]:
    return [item["application_id"] for item in response[group]["items"]]


async def test_ranked_candidates_group_paginate_and_filter_existing_scores(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    user = create_user("recruiter")
    job = _job(committed_db, user)
    top = _application(committed_db, job, "Alex", stage="screening", applied_days_ago=5)
    second = _application(committed_db, job, "Sam", applied_days_ago=0)
    third = _application(committed_db, job, "Riley", applied_days_ago=3)
    review = _application(committed_db, job, "Jordan", cv_status="failed")
    review_stored = _application(committed_db, job, "Cameron")
    pending = _application(committed_db, job, "Taylor", cv_status="queued")
    stale = _application(committed_db, job, "Morgan")
    committed_db.execute(
        insert(ApplicationScore),
        [
            _outcome(committed_db, job, top, score=99, is_current=False),
            _outcome(committed_db, job, top, score=86, years=8),
            _outcome(committed_db, job, second, score=71, years=2, skill="Python"),
            _outcome(committed_db, job, third, score=58, years=None, skill="Postgres"),
            _outcome(committed_db, job, review, score=93),
            _outcome(committed_db, job, review_stored, score=None),
            _outcome(committed_db, job, stale, score=100, version="older-model"),
        ],
    )
    committed_db.commit()
    login_as(user)
    url = f"/api/v1/jobs/{job.id}/ranked-candidates"

    async def get(**params: Any) -> dict[str, Any]:
        response = await async_client.get(url, params=params)
        assert response.status_code == 200, response.text
        result: dict[str, Any] = response.json()
        return result

    ranked = await get()
    assert _ids(ranked) == [str(top), str(second), str(third)]
    assert set(_ids(ranked, "needs_manual_review")) == {str(review), str(review_stored)}
    assert set(_ids(ranked, "unranked")) == {str(pending), str(stale)}
    assert {row["status"] for row in ranked["unranked"]["items"]} == {"pending", "rescoring"}
    assert all(row["score"] is None for row in ranked["needs_manual_review"]["items"])
    assert ranked["ranked"]["items"][0]["score"] == 86
    assert "advisory" in ranked["advisory_note"]

    page_two = await get(page=2, per_page=1)
    assert _ids(page_two) == [str(second)]
    assert page_two["ranked"]["pagination"]["total_items"] == 3
    assert page_two["needs_manual_review"]["pagination"]["total_items"] == 2
    independent = await get(page=2, ranked_page=1, review_page=2, unranked_page=1, per_page=1)
    assert _ids(independent) == [str(top)]
    assert independent["ranked"]["pagination"]["page"] == 1
    assert independent["needs_manual_review"] == page_two["needs_manual_review"]
    assert independent["unranked"]["pagination"]["page"] == 1
    fallback = await get(page=2, review_page=1, per_page=1)
    assert fallback["ranked"] == page_two["ranked"]
    assert fallback["unranked"] == page_two["unranked"]
    assert fallback["needs_manual_review"]["pagination"]["page"] == 1
    for page_param in ("ranked_page", "review_page", "unranked_page"):
        assert (await async_client.get(url, params={page_param: 0})).status_code == 422
    empty_page = await get(page=4, per_page=1)
    assert _ids(empty_page) == []
    assert empty_page["ranked"]["pagination"]["total_items"] == 3
    assert _ids(await get(sort_by="applied_at")) == [str(second), str(third), str(top)]
    assert _ids(await get(sort_order="asc")) == [str(third), str(second), str(top)]
    assert _ids(await get(stage_id=str(_stage(committed_db, job, "screening")))) == [str(top)]
    assert _ids(await get(min_score=71)) == [str(top), str(second)]
    assert _ids(await get(required_skill="  POSTGRES  ")) == [str(top), str(third)]
    assert _ids(await get(required_skill="Rust")) == []
    filtered = await get(required_skill="Postgres", min_experience_years=4, min_score=80)
    assert filtered["ranked"]["items"] == ranked["ranked"]["items"][:1]
    assert filtered["needs_manual_review"]["items"] == []
    assert _ids(await get(min_experience_years=0)) == [str(top), str(second)]
    assert (await async_client.get(url, params={"min_score": 101})).status_code == 422
    assert (await async_client.get(url, params={"per_page": 101})).status_code == 422
    assert await get() == ranked

    application = committed_db.get(Application, top)
    assert application is not None
    candidate = application.candidate
    original = dict(candidate.parsed_data)
    candidate.parsed_data = {**original, "experience_years": 9}
    committed_db.commit()
    assert _ids(await get()) == [str(second), str(third)]
    detail = f"/api/v1/applications/{top}/score"
    old = (await async_client.get(detail)).json()
    assert (old["status"], old["score"]) == ("rescoring", 86)

    candidate.parsed_data = original
    job.min_experience_years = 9
    committed_db.commit()
    assert _ids(await get()) == []
    assert _ids(await get(min_score=0), "unranked") == []
    assert (await async_client.get(detail)).json()["status"] == "rescoring"

    job.min_experience_years = 0
    committed_db.add(
        CvDocument(
            org_id=job.org_id,
            candidate_id=candidate.id,
            storage_key="replacement.pdf",
            original_filename="replacement.pdf",
            content_type="application/pdf",
            size_bytes=100,
            sha256="b" * 64,
            status="queued",
        )
    )
    committed_db.commit()
    assert _ids(await get()) == [str(second), str(third)]
    assert (await async_client.get(detail)).json()["status"] == "rescoring"


async def test_score_detail_and_ranking_respect_org_and_viewer_scope(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    user = create_user("recruiter")
    viewer = create_user("viewer", org_id=user.org_id)
    outsider = create_user("admin")
    job = _job(committed_db, user)
    scored = _application(committed_db, job, "Alex", stage="screening")
    review = _application(committed_db, job, "Sam", cv_status="needs_review")
    pending = _application(committed_db, job, "Taylor", cv_status="extracting")
    stale = _application(committed_db, job, "Morgan")
    saved = _outcome(committed_db, job, scored, score=86)
    legacy = _application(committed_db, job, "Legacy")
    legacy_application = committed_db.get(Application, legacy)
    assert legacy_application is not None
    committed_db.add(
        Score(
            org_id=job.org_id,
            job_id=job.id,
            application_id=legacy,
            candidate_id=legacy_application.candidate_id,
            overall_score=90,
            semantic_score=90,
            model_version="legacy-model",
        )
    )
    committed_db.execute(
        insert(ApplicationScore),
        [saved, _outcome(committed_db, job, stale, score=55, version="older-model")],
    )
    committed_db.commit()

    def detail(id_: uuid.UUID) -> str:
        return f"/api/v1/applications/{id_}/score"

    rankings = f"/api/v1/jobs/{job.id}/ranked-candidates"
    assert (await async_client.get(rankings)).status_code == 401
    assert (await async_client.get(detail(scored))).status_code == 401
    login_as(outsider)
    assert (await async_client.get(rankings)).status_code == 404
    assert (await async_client.get(detail(scored))).status_code == 404
    login_as(viewer)
    assert (await async_client.get(rankings)).status_code == 403
    assert (await async_client.get(detail(review))).status_code == 404
    response = await async_client.get(detail(scored))
    assert response.status_code == 200, response.text
    assert response.json()["explanation"] == saved["explanation"]
    login_as(user)
    for application, status in (
        (review, "needs_manual_review"),
        (pending, "pending"),
        (legacy, "pending"),
    ):
        response = await async_client.get(detail(application))
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["status"] == status
        assert result["score"] is result["explanation"] is None
    old = (await async_client.get(detail(stale))).json()
    assert (old["status"], old["score"], old["model_version"]) == ("rescoring", 55, "older-model")
    assert (await async_client.get(detail(uuid.uuid4()))).status_code == 404


async def test_reading_all_1000_stored_ranks(
    async_client: AsyncClient,
    committed_db: Session,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    user = create_user("recruiter")
    job = _job(committed_db, user)
    stage_id = _stage(committed_db, job, "applied")
    candidates = [uuid.uuid4() for _ in range(1000)]
    applications = [uuid.uuid4() for _ in candidates]
    committed_db.execute(
        insert(Candidate),
        [
            {
                "id": id_,
                "org_id": user.org_id,
                "full_name": f"Candidate {i}",
                "email": f"c{i}@example.com",
            }
            for i, id_ in enumerate(candidates)
        ],
    )
    committed_db.execute(
        insert(CvDocument),
        [
            {
                "org_id": user.org_id,
                "candidate_id": id_,
                "storage_key": f"benchmark/{id_}.pdf",
                "original_filename": "resume.pdf",
                "content_type": "application/pdf",
                "size_bytes": 100,
                "sha256": "a" * 64,
                "status": "parsed",
            }
            for id_ in candidates
        ],
    )
    committed_db.execute(
        insert(Application),
        [
            {
                "id": id_,
                "org_id": user.org_id,
                "job_id": job.id,
                "candidate_id": candidate_id,
                "stage_id": stage_id,
            }
            for id_, candidate_id in zip(applications, candidates, strict=True)
        ],
    )
    candidates_by_id = {
        c.id: c
        for c in committed_db.scalars(select(Candidate).where(Candidate.org_id == job.org_id))
    }
    committed_db.execute(
        insert(ApplicationScore),
        [
            _outcome(
                committed_db, job, app_id, score=i / 10, candidate=candidates_by_id[candidate_id]
            )
            for i, (app_id, candidate_id) in enumerate(zip(applications, candidates, strict=True))
        ],
    )
    committed_db.commit()
    login_as(user)
    url = f"/api/v1/jobs/{job.id}/ranked-candidates"
    started = perf_counter()
    ranked = []
    for page in range(1, 11):
        response = await async_client.get(url, params={"page": page, "per_page": 100})
        assert response.status_code == 200, response.text
        ranked.extend(_ids(response.json()))
    elapsed = perf_counter() - started
    assert ranked == [str(id_) for id_ in reversed(applications)]
    print(f"1,000 ranked candidates across 10 HTTP pages in {elapsed:.3f}s")
    if os.getenv("ATS_ASSERT_RANKING_TIMING") == "1":
        assert elapsed < 10


def test_openapi_draft_exposes_both_operations() -> None:
    draft = Path(__file__).resolve().parents[2] / "docs" / "openapi.yaml"
    spec = yaml.safe_load(draft.read_text())
    runtime = app.openapi()["paths"]
    for path in ("/jobs/{id}/ranked-candidates", "/applications/{id}/score"):
        operation = spec["paths"][path]["get"]
        implementation = runtime[f"/api/v1{path}"]["get"]
        assert operation["operationId"] == implementation["operationId"]
        assert {p["name"] for p in operation["parameters"] if p.get("in") == "query"} == {
            p["name"] for p in implementation["parameters"] if p["in"] == "query"
        }
