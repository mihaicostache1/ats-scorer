"""Pipeline service: default stage seeding and per-job stage lookup."""

import uuid

from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.pipeline_stage import PipelineStage

# (name, stage_type) in pipeline order. Migration 002 backfills the same list.
DEFAULT_STAGES: tuple[tuple[str, str], ...] = (
    ("Applied", "applied"),
    ("Shortlisted", "screening"),
    ("Interview", "interview"),
    ("Offer", "offer"),
    ("Hired", "hired"),
    ("Rejected", "rejected"),
)


def seed_default_stages(db: Session, org_id: uuid.UUID) -> list[PipelineStage]:
    """Add the org-default pipeline stages for a new organization.

    The organization row must already be flushed. The caller commits.
    """
    stages = [
        PipelineStage(
            id=uuid.uuid4(),
            org_id=org_id,
            job_id=None,
            name=name,
            stage_order=order,
            stage_type=stage_type,
        )
        for order, (name, stage_type) in enumerate(DEFAULT_STAGES, start=1)
    ]
    db.add_all(stages)
    return stages


def get_job_stages(db: Session, job: Job) -> list[PipelineStage]:
    """Return the job's own stages in order, or the org defaults when it has none."""
    org_stages = db.query(PipelineStage).filter(PipelineStage.org_id == job.org_id)
    own = (
        org_stages.filter(PipelineStage.job_id == job.id).order_by(PipelineStage.stage_order).all()
    )
    if own:
        return own
    return (
        org_stages.filter(PipelineStage.job_id.is_(None)).order_by(PipelineStage.stage_order).all()
    )
