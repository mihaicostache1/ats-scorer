"""Keep the original parser output separately from recruiter corrections.

Revision ID: 006_cv_structured_extraction
Revises: 005_cv_text_extraction
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "006_cv_structured_extraction"
down_revision: str | None = "005_cv_text_extraction"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "candidates",
        sa.Column("parsed_data_original", postgresql.JSONB(), server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("candidates", "parsed_data_original")
