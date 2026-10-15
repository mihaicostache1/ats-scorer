"""Nullable score components and a score snapshot on each stage move.

Revision ID: 004_nullable_scores_and_snapshot
Revises: 003_cv_documents
Create Date: 2026-10-14 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_nullable_scores_and_snapshot"
down_revision: str | None = "003_cv_documents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Components a scoring model may not compute (NULL = not computed, which is not a 0).
_OPTIONAL_COMPONENTS = ("skill_overlap_score", "experience_score", "title_fit_score")


def upgrade() -> None:
    for column in _OPTIONAL_COMPONENTS:
        op.alter_column("scores", column, existing_type=sa.Numeric(5, 2), nullable=True)

    # The score a recruiter saw when moving an application; a later re-score
    # replaces the row in scores, so the value is copied here.
    op.add_column(
        "application_stage_history",
        sa.Column("overall_score", sa.Numeric(precision=5, scale=2), nullable=True),
    )
    op.add_column(
        "application_stage_history",
        sa.Column("model_version", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("application_stage_history", "model_version")
    op.drop_column("application_stage_history", "overall_score")

    for column in _OPTIONAL_COMPONENTS:
        # NOT NULL cannot be restored while NULLs exist; 0 is the only value available.
        op.execute(f"UPDATE scores SET {column} = 0 WHERE {column} IS NULL")
        op.alter_column("scores", column, existing_type=sa.Numeric(5, 2), nullable=False)
