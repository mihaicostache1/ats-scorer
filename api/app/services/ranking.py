"""Read B-18 outcomes without running the scorer."""

import uuid
from operator import itemgetter
from typing import Any

from ats_scoring import MODEL_VERSION
from ats_scoring.explanation import TEMPLATES
from ats_scoring.skills import normalize_skill
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session, load_only

from app.models.application import Application
from app.models.application_score import ApplicationScore
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.models.pipeline_stage import PipelineStage
from app.schemas.cv_document import CvStatus
from app.schemas.job import SortOrder
from app.schemas.pagination import PaginationMeta
from app.schemas.ranking import (
    RankedCandidate,
    RankedCandidatesPage,
    RankedCandidatesResponse,
    RankingSort,
    ScoreResponse,
    ScoreStatus,
)
from app.services.scoring_inputs import (
    PROCESSING_CV_STATUSES,
    candidate_inputs,
    job_inputs,
    scoring_digest,
)

_REVIEW = (CvStatus.NEEDS_REVIEW.value, CvStatus.FAILED.value)
_VIEWER_STAGES = ("screening", "interview", "offer", "hired")


def _outcomes(org_id: uuid.UUID, *columns: Any) -> Select[Any]:
    cv_status = (
        select(CvDocument.status)
        .where(CvDocument.org_id == org_id, CvDocument.candidate_id == Application.candidate_id)
        .order_by(CvDocument.created_at.desc(), CvDocument.id.desc())
        .limit(1)
        .correlate(Application)
        .scalar_subquery()
    )
    return (
        select(
            Application.id.label("application_id"),
            Job,
            Candidate,
            cv_status.label("cv_status"),
            ApplicationScore.status.label("stored_status"),
            ApplicationScore.inputs_hash,
            ApplicationScore.score,
            ApplicationScore.band,
            ApplicationScore.model_version,
            ApplicationScore.computed_at,
            *columns,
        )
        .select_from(Application)
        .join(Job, and_(Job.id == Application.job_id, Job.org_id == org_id))
        .join(Candidate, and_(Candidate.id == Application.candidate_id, Candidate.org_id == org_id))
        .join(
            PipelineStage,
            and_(
                PipelineStage.id == Application.stage_id,
                PipelineStage.org_id == org_id,
                or_(PipelineStage.job_id.is_(None), PipelineStage.job_id == Application.job_id),
            ),
        )
        .outerjoin(
            ApplicationScore,
            and_(
                ApplicationScore.application_id == Application.id,
                ApplicationScore.org_id == org_id,
                ApplicationScore.is_current,
            ),
        )
        .where(Application.org_id == org_id)
        .options(
            load_only(
                Job.id,
                Job.org_id,
                Job.title,
                Job.description,
                Job.required_skills,
                Job.preferred_skills,
                Job.min_experience_years,
                Job.embedding,
                Job.embedding_model_version,
            ),
            load_only(
                Candidate.id,
                Candidate.full_name,
                Candidate.parsed_data,
                Candidate.parsed_data_original,
                Candidate.embedding_name_aliases,
                Candidate.embedding,
                Candidate.embedding_model_version,
            ),
        )
        .execution_options(populate_existing=True)
    )


def _score_status(row: Any, job_hash: str) -> ScoreStatus:
    if row.cv_status in _REVIEW:
        return ScoreStatus.NEEDS_MANUAL_REVIEW
    has_score = row.stored_status == "scored"
    if row.cv_status in PROCESSING_CV_STATUSES or row.stored_status is None:
        return ScoreStatus.RESCORING if has_score else ScoreStatus.PENDING
    if row.model_version != MODEL_VERSION or (
        candidate_inputs(row.Candidate, row.cv_status, job_hash).inputs_hash != row.inputs_hash
    ):
        return ScoreStatus.RESCORING if has_score else ScoreStatus.PENDING
    return ScoreStatus.SCORED if has_score else ScoreStatus.NEEDS_MANUAL_REVIEW


def _summary(row: Any, status: ScoreStatus) -> dict[str, Any]:
    visible = status in (ScoreStatus.SCORED, ScoreStatus.RESCORING)
    return {
        "status": status,
        "score": row.score if visible else None,
        "band": row.band if visible else None,
        "model_version": row.model_version if visible else None,
        "computed_at": row.computed_at if visible else None,
    }


def get_score_detail(
    db: Session, org_id: uuid.UUID, application_id: uuid.UUID, *, viewer: bool
) -> ScoreResponse | None:
    query = _outcomes(org_id, ApplicationScore.id, ApplicationScore.explanation).where(
        Application.id == application_id
    )
    if viewer:
        query = query.where(PipelineStage.stage_type.in_(_VIEWER_STAGES))
    row = db.execute(query).one_or_none()
    if row is None:
        return None
    status = _score_status(row, scoring_digest(*job_inputs(row.Job)))
    visible = status in (ScoreStatus.SCORED, ScoreStatus.RESCORING)
    return ScoreResponse.model_validate(
        {
            **_summary(row, status),
            "id": row.id if visible else None,
            "application_id": row.application_id,
            "explanation": row.explanation if visible else None,
        }
    )


def list_ranked_candidates(
    db: Session,
    job: Job,
    *,
    stage_id: uuid.UUID | None,
    min_score: float | None,
    required_skill: str | None,
    min_experience_years: float | None,
    sort_by: RankingSort,
    sort_order: SortOrder,
    page: int,
    per_page: int,
) -> RankedCandidatesResponse:
    query = _outcomes(
        job.org_id,
        Application.candidate_id,
        Application.stage_id,
        PipelineStage.name.label("stage_name"),
        Application.applied_at,
        ApplicationScore.explanation["experience"]["candidate_years"]
        .as_float()
        .label("experience_years"),
        ApplicationScore.explanation["matched_skills"].label("matched_skills"),
    ).where(Application.job_id == job.id)
    if stage_id is not None:
        query = query.where(Application.stage_id == stage_id)

    # Source inputs and scores come from one snapshot before grouping and pagination.
    groups: dict[str, list[dict[str, Any]]] = {
        "ranked": [],
        "needs_manual_review": [],
        "unranked": [],
    }
    has_fit_filter = any(v is not None for v in (min_score, required_skill, min_experience_years))
    skill = normalize_skill(required_skill) if required_skill is not None else None
    job_hash = None
    for row in db.execute(query):
        if job_hash is None:
            job_hash = scoring_digest(*job_inputs(row.Job))
        status = _score_status(row, job_hash)
        if has_fit_filter and status != ScoreStatus.SCORED:
            continue
        if min_score is not None and row.score < min_score:
            continue
        if min_experience_years is not None and (
            row.experience_years is None or row.experience_years < min_experience_years
        ):
            continue
        if skill is not None and (
            not skill
            or not any(
                match["requirement"] == "required" and normalize_skill(match["skill"]) == skill
                for match in (row.matched_skills or [])
            )
        ):
            continue
        group = {
            ScoreStatus.SCORED: "ranked",
            ScoreStatus.NEEDS_MANUAL_REVIEW: "needs_manual_review",
        }.get(status, "unranked")
        summary = _summary(row, status)
        groups[group].append(
            {
                **summary,
                "application_id": row.application_id,
                "candidate_id": row.candidate_id,
                "full_name": row.Candidate.full_name,
                "stage_id": row.stage_id,
                "stage_name": row.stage_name,
                "cv_status": row.cv_status,
                "applied_at": row.applied_at,
                "experience_years": row.experience_years if summary["score"] is not None else None,
            }
        )

    start = (page - 1) * per_page
    pages = {}
    for name, rows in groups.items():
        rows.sort(key=itemgetter("application_id"))
        if name == "ranked" and sort_by == RankingSort.SCORE:
            rows.sort(key=itemgetter("applied_at"), reverse=True)
            rows.sort(key=itemgetter("score"), reverse=sort_order == SortOrder.DESC)
        else:
            rows.sort(
                key=itemgetter("applied_at"),
                reverse=sort_by == RankingSort.SCORE or sort_order == SortOrder.DESC,
            )
        pages[name] = RankedCandidatesPage(
            items=[RankedCandidate.model_validate(row) for row in rows[start : start + per_page]],
            pagination=PaginationMeta.build(page, per_page, len(rows)),
        )
    return RankedCandidatesResponse(
        ranked=pages["ranked"],
        needs_manual_review=pages["needs_manual_review"],
        unranked=pages["unranked"],
        advisory_note=TEMPLATES["advisory"],
    )
