"""Read B-18 outcomes without running the scorer."""

import uuid
from typing import Any

from ats_scoring import MODEL_VERSION
from ats_scoring.explanation import TEMPLATES
from ats_scoring.skills import normalize_skill
from sqlalchemy import ColumnElement, Select, and_, case, false, func, or_, select
from sqlalchemy.orm import Session

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

_IN_PROGRESS = (CvStatus.QUEUED.value, CvStatus.EXTRACTING.value, CvStatus.EXTRACTED.value)
_REVIEW = (CvStatus.NEEDS_REVIEW.value, CvStatus.FAILED.value)
_VIEWER_STAGES = ("screening", "interview", "offer", "hired")


def _latest_cv_status(org_id: uuid.UUID) -> ColumnElement[str]:
    return (
        select(CvDocument.status)
        .where(CvDocument.org_id == org_id, CvDocument.candidate_id == Application.candidate_id)
        .order_by(CvDocument.created_at.desc(), CvDocument.id.desc())
        .limit(1)
        .correlate(Application)
        .scalar_subquery()
    )


def _outcomes(org_id: uuid.UUID, *columns: Any) -> Select[Any]:
    cv_status = _latest_cv_status(org_id)
    outcome_status = case(
        (cv_status.in_(_REVIEW), ScoreStatus.NEEDS_MANUAL_REVIEW.value),
        (
            and_(
                ApplicationScore.status == "needs_review", cv_status.in_(_IN_PROGRESS).is_not(True)
            ),
            ScoreStatus.NEEDS_MANUAL_REVIEW.value,
        ),
        (
            and_(
                ApplicationScore.status == "scored", ApplicationScore.model_version == MODEL_VERSION
            ),
            ScoreStatus.SCORED.value,
        ),
        (ApplicationScore.status == "scored", ScoreStatus.RESCORING.value),
        else_=ScoreStatus.PENDING.value,
    )
    return (
        select(
            Application.id.label("application_id"),
            outcome_status.label("status"),
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
    )


def _hide_unavailable_score(values: dict[str, Any]) -> dict[str, Any]:
    if values["status"] not in (ScoreStatus.SCORED, ScoreStatus.RESCORING):
        for field in (
            "id",
            "score",
            "band",
            "model_version",
            "computed_at",
            "explanation",
            "experience_years",
        ):
            if field in values:
                values[field] = None
    return values


def get_score_detail(
    db: Session, org_id: uuid.UUID, application_id: uuid.UUID, *, viewer: bool
) -> ScoreResponse | None:
    query = _outcomes(org_id, ApplicationScore.id, ApplicationScore.explanation).where(
        Application.id == application_id
    )
    if viewer:
        query = query.where(PipelineStage.stage_type.in_(_VIEWER_STAGES))
    row = db.execute(query).mappings().one_or_none()
    return None if row is None else ScoreResponse.model_validate(_hide_unavailable_score(dict(row)))


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
    rows = _outcomes(
        job.org_id,
        Application.candidate_id,
        Candidate.full_name,
        Application.stage_id,
        PipelineStage.name.label("stage_name"),
        _latest_cv_status(job.org_id).label("cv_status"),
        Application.applied_at,
        ApplicationScore.explanation["experience"]["candidate_years"]
        .as_float()
        .label("experience_years"),
        ApplicationScore.explanation["matched_skills"].label("matched_skills"),
    ).where(Application.job_id == job.id)
    if stage_id is not None:
        rows = rows.where(Application.stage_id == stage_id)
    outcomes = rows.subquery()
    status = outcomes.c.status
    group = case(
        (status == ScoreStatus.SCORED.value, "ranked"),
        (status == ScoreStatus.NEEDS_MANUAL_REVIEW.value, "needs_manual_review"),
        else_="unranked",
    ).label("score_group")
    order: ColumnElement[Any]
    ordering: tuple[ColumnElement[Any], ...]
    if sort_by == RankingSort.SCORE:
        order = case((status == ScoreStatus.SCORED.value, outcomes.c.score))
        direction = order.asc() if sort_order == SortOrder.ASC else order.desc()
        ordering = (direction.nulls_last(), outcomes.c.applied_at.desc(), outcomes.c.application_id)
    else:
        order = outcomes.c.applied_at
        direction = order.asc() if sort_order == SortOrder.ASC else order.desc()
        ordering = (direction, outcomes.c.application_id)
    numbered = select(
        *(column for column in outcomes.c if column.key != "matched_skills"),
        group,
        func.row_number().over(partition_by=group, order_by=ordering).label("position"),
    )
    if min_score is not None or min_experience_years is not None or required_skill is not None:
        numbered = numbered.where(status == ScoreStatus.SCORED.value)
    if min_score is not None:
        numbered = numbered.where(outcomes.c.score >= min_score)
    if min_experience_years is not None:
        numbered = numbered.where(outcomes.c.experience_years >= min_experience_years)
    if required_skill is not None:
        skill = normalize_skill(required_skill)
        spellings = {
            name.strip()
            for name in job.required_skills
            if skill and isinstance(name, str) and normalize_skill(name) == skill
        }
        numbered = numbered.where(
            or_(
                false(),
                *(
                    outcomes.c.matched_skills.contains([{"skill": name, "requirement": "required"}])
                    for name in spellings
                ),
            )
        )

    # Count and paginate in one snapshot, including totals for a group beyond its last page.
    ranked = numbered.cte("ranked_outcomes")
    totals = (
        select(ranked.c.score_group, func.count().label("total_items"))
        .group_by(ranked.c.score_group)
        .subquery()
    )
    start = (page - 1) * per_page
    query = (
        select(totals.c.score_group.label("page_group"), totals.c.total_items, *ranked.c)
        .select_from(
            totals.outerjoin(
                ranked,
                and_(
                    ranked.c.score_group == totals.c.score_group,
                    ranked.c.position > start,
                    ranked.c.position <= start + per_page,
                ),
            )
        )
        .order_by(ranked.c.position)
    )
    groups = {
        name: RankedCandidatesPage(items=[], pagination=PaginationMeta.build(page, per_page, 0))
        for name in ("ranked", "needs_manual_review", "unranked")
    }
    for row in db.execute(query).mappings():
        target = groups[row["page_group"]]
        target.pagination = PaginationMeta.build(page, per_page, row["total_items"])
        if row["application_id"] is not None:
            target.items.append(RankedCandidate.model_validate(_hide_unavailable_score(dict(row))))
    return RankedCandidatesResponse(
        ranked=groups["ranked"],
        needs_manual_review=groups["needs_manual_review"],
        unranked=groups["unranked"],
        advisory_note=TEMPLATES["advisory"],
    )
