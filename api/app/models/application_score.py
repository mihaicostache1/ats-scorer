"""Versioned scoring outcomes for an application."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.application import Application


class ApplicationScore(Base):
    __tablename__ = "application_scores"

    __table_args__ = (
        ForeignKeyConstraint(
            ["org_id", "application_id"],
            ["applications.org_id", "applications.id"],
            name="fk_application_scores_org_application",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "(status = 'scored' AND score IS NOT NULL AND score BETWEEN 0 AND 100 "
            "AND band IS NOT NULL AND band IN ('strong', 'moderate', 'weak') "
            "AND explanation IS NOT NULL AND jsonb_typeof(explanation) = 'object') "
            "OR (status = 'needs_review' AND score IS NULL AND band IS NULL "
            "AND explanation IS NULL)",
            name="ck_application_scores_outcome",
        ),
        Index("ix_application_scores_history", "org_id", "application_id", "computed_at"),
        Index(
            "uq_application_scores_current",
            "application_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    band: Mapped[str | None] = mapped_column(String(8), nullable=True)
    explanation: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    inputs_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    is_current: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    application: Mapped["Application"] = relationship(back_populates="score_history")
