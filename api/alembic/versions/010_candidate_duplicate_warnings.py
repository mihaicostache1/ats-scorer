"""Allow repeated candidate emails for review-only duplicate warnings.

Revision ID: 010_candidate_duplicate_warnings
Revises: 009_global_user_email
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "010_candidate_duplicate_warnings"
down_revision: str | None = "009_global_user_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_candidates_org_email", "candidates", type_="unique")
    op.create_index("ix_candidates_org_email", "candidates", ["org_id", "email"])


def downgrade() -> None:
    duplicates = op.get_bind().scalar(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM candidates GROUP BY org_id, email HAVING count(*) > 1)"
        )
    )
    if duplicates:
        raise RuntimeError(
            "Resolve candidates sharing an email within an organization before downgrading B-16. "
            "No candidates have been merged or deleted."
        )
    op.drop_index("ix_candidates_org_email", table_name="candidates")
    op.create_unique_constraint("uq_candidates_org_email", "candidates", ["org_id", "email"])
