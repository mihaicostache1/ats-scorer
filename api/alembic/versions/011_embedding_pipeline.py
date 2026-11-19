"""Record the model that computed each candidate and job embedding.

The dimension and HNSW cosine indexes were introduced in 001_initial_schema.

Revision ID: 011_embedding_pipeline
Revises: 010_candidate_duplicate_warnings
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "011_embedding_pipeline"
down_revision: str | None = "010_candidate_duplicate_warnings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("candidates", "jobs"):
        op.add_column(table, sa.Column("embedding_model_version", sa.String(255), nullable=True))


def downgrade() -> None:
    for table in ("jobs", "candidates"):
        op.drop_column(table, "embedding_model_version")
