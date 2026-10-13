"""Candidate consent timestamp, default pipeline stages and application stage history.

Revision ID: 002_candidates_applications
Revises: 001_initial_schema
Create Date: 2026-10-13 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_candidates_applications"
down_revision: str | None = "001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Candidate consent timestamp (NULL = no consent recorded)
    op.add_column(
        "candidates",
        sa.Column("consent_given_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Org-default pipeline stages (job_id IS NULL): one per position, and
    #    backfilled for organizations that existed before stages were seeded.
    op.create_index(
        "uq_pipeline_stages_org_default_order",
        "pipeline_stages",
        ["org_id", "stage_order"],
        unique=True,
        postgresql_where=sa.text("job_id IS NULL"),
    )
    op.execute(
        """
        INSERT INTO pipeline_stages (org_id, job_id, name, stage_order, stage_type)
        SELECT o.id, NULL, s.name, s.stage_order, s.stage_type
        FROM organizations o
        CROSS JOIN (
            VALUES
                ('Applied', 1, 'applied'),
                ('Shortlisted', 2, 'screening'),
                ('Interview', 3, 'interview'),
                ('Offer', 4, 'offer'),
                ('Hired', 5, 'hired'),
                ('Rejected', 6, 'rejected')
        ) AS s(name, stage_order, stage_type)
        WHERE NOT EXISTS (
            SELECT 1 FROM pipeline_stages p WHERE p.org_id = o.id AND p.job_id IS NULL
        );
        """
    )

    # 3. Create application_stage_history
    op.create_table(
        "application_stage_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_stage_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pipeline_stages.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "to_stage_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pipeline_stages.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "moved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "moved_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_application_stage_history_org_application",
        "application_stage_history",
        ["org_id", "application_id"],
    )


def downgrade() -> None:
    # The backfilled default stages are left in place: applications may reference them.
    op.drop_table("application_stage_history")
    op.drop_index("uq_pipeline_stages_org_default_order", table_name="pipeline_stages")
    op.drop_column("candidates", "consent_given_at")
