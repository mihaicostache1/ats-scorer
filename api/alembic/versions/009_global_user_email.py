"""Enforce global, case-insensitive email identity for organization-free login.

Revision ID: 009_global_user_email
Revises: 008_user_invitations
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "009_global_user_email"
down_revision: str | None = "008_user_invitations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    duplicates = op.get_bind().scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1)")
    )
    if duplicates:
        raise RuntimeError(
            "Resolve users sharing an email (case-insensitively) across organizations before "
            "upgrading. No users have been merged or deleted."
        )
    op.create_index("uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True)


def downgrade() -> None:
    op.drop_index("uq_users_email_lower", table_name="users")
