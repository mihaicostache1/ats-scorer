"""Store versioned application scoring outcomes (B-18).

Revision ID: 012_application_scores
Revises: 011_embedding_pipeline
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "012_application_scores"
down_revision: str | None = "011_embedding_pipeline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_applications_org_id", "applications", ["org_id", "id"])
    op.create_table(
        "application_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("application_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("score", sa.Numeric(5, 2)),
        sa.Column("band", sa.String(8)),
        sa.Column("explanation", postgresql.JSONB(none_as_null=True)),
        sa.Column("model_version", sa.String(50), nullable=False),
        sa.Column("inputs_hash", sa.String(64), nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.clock_timestamp(),
            nullable=False,
        ),
        sa.Column("is_current", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id", "application_id"],
            ["applications.org_id", "applications.id"],
            name="fk_application_scores_org_application",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "(status = 'scored' AND score IS NOT NULL AND score BETWEEN 0 AND 100 "
            "AND band IS NOT NULL AND band IN ('strong', 'moderate', 'weak') "
            "AND explanation IS NOT NULL AND jsonb_typeof(explanation) = 'object') "
            "OR (status = 'needs_review' AND score IS NULL AND band IS NULL "
            "AND explanation IS NULL)",
            name="ck_application_scores_outcome",
        ),
    )
    op.create_index(
        "ix_application_scores_history",
        "application_scores",
        ["org_id", "application_id", "computed_at"],
    )
    op.create_index(
        "uq_application_scores_current",
        "application_scores",
        ["application_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )


def downgrade() -> None:
    op.drop_table("application_scores")
    op.drop_constraint("uq_applications_org_id", "applications", type_="unique")
