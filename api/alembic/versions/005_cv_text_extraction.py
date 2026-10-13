"""CV text extraction: extracted text, page count, OCR flag, error reason and attempts.

Revision ID: 005_cv_text_extraction
Revises: 004_nullable_scores_and_snapshot
Create Date: 2026-10-15 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_cv_text_extraction"
down_revision: str | None = "004_nullable_scores_and_snapshot"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cv_documents", sa.Column("extracted_text", sa.Text(), nullable=True))
    op.add_column("cv_documents", sa.Column("page_count", sa.Integer(), nullable=True))
    op.add_column(
        "cv_documents",
        sa.Column("ocr_used", sa.Boolean(), server_default=sa.text("FALSE"), nullable=False),
    )
    op.add_column("cv_documents", sa.Column("error_code", sa.String(length=50), nullable=True))
    op.add_column("cv_documents", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column(
        "cv_documents",
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cv_documents", sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    for column in (
        "processed_at",
        "attempts",
        "error_message",
        "error_code",
        "ocr_used",
        "page_count",
        "extracted_text",
    ):
        op.drop_column("cv_documents", column)
