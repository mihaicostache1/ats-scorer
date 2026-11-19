"""Record the model that computed each candidate and job embedding.

The dimension and HNSW cosine indexes were introduced in 001_initial_schema.

Revision ID: 011_embedding_pipeline
Revises: 010_candidate_duplicate_warnings
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "011_embedding_pipeline"
down_revision: str | None = "010_candidate_duplicate_warnings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("candidates", "jobs"):
        op.add_column(table, sa.Column("embedding_model_version", sa.String(255), nullable=True))
    op.add_column(
        "candidates",
        sa.Column("embedding_ready", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "candidates",
        sa.Column(
            "embedding_name_aliases", postgresql.JSONB(), server_default="[]", nullable=False
        ),
    )
    # Existing profiles may outlive a newer failed or unfinished upload.
    op.execute(
        """
        UPDATE candidates AS c SET embedding_ready = true
        WHERE c.parsed_data ? 'schema_version'
          AND (
            c.parsed_profile_reviewed_at IS NOT NULL OR
            COALESCE((
              SELECT d.status
              FROM cv_documents AS d
              WHERE d.org_id = c.org_id AND d.candidate_id = c.id
                AND d.status IN ('parsed', 'needs_review')
              ORDER BY d.created_at DESC, d.id DESC
              LIMIT 1
            ), 'parsed') = 'parsed'
          )
        """
    )
    op.create_index(
        "ix_candidates_embeddings_pending",
        "candidates",
        ["id"],
        postgresql_where=sa.text("embedding_ready AND embedding_model_version IS NULL"),
    )
    op.create_index(
        "ix_jobs_embeddings_pending",
        "jobs",
        ["id"],
        postgresql_where=sa.text("embedding_model_version IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_jobs_embeddings_pending", table_name="jobs")
    op.drop_index("ix_candidates_embeddings_pending", table_name="candidates")
    op.drop_column("candidates", "embedding_name_aliases")
    op.drop_column("candidates", "embedding_ready")
    for table in ("jobs", "candidates"):
        op.drop_column(table, "embedding_model_version")
