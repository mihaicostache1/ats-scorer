"""Track who last reviewed a candidate's parsed profile and when.

Revision ID: 007_parsed_profile_review
Revises: 006_cv_structured_extraction
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "007_parsed_profile_review"
down_revision: str | None = "006_cv_structured_extraction"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "candidates",
        sa.Column(
            "parsed_profile_reviewed_by",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "candidates",
        sa.Column(
            "parsed_profile_reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_candidates_parsed_profile_reviewer",
        "candidates",
        "users",
        ["parsed_profile_reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_candidates_parsed_profile_reviewer", "candidates", type_="foreignkey")
    op.drop_column("candidates", "parsed_profile_reviewed_at")
    op.drop_column("candidates", "parsed_profile_reviewed_by")
