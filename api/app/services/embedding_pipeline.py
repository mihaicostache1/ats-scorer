"""Fill versioned embeddings from saved profiles and postings."""

import asyncio
import uuid
from dataclasses import dataclass
from functools import cache
from typing import Any, Literal, cast

from ats_scoring.config import DEFAULT_CONFIG
from ats_scoring.embeddings import Embedder
from ats_scoring.parsed_cv import SCHEMA_VERSION
from sqlalchemy import ColumnElement, Table, and_, or_, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.schemas.cv_document import CvStatus

BATCH_SIZE = 32
JOB_EMBEDDING_FIELDS = ("title", "description", "required_skills", "preferred_skills")
EmbeddingKind = Literal["candidates", "jobs"]
EMBEDDING_MODEL_VERSION = f"{DEFAULT_CONFIG.embedding.model}@{DEFAULT_CONFIG.embedding.revision}"


@dataclass(frozen=True)
class EmbeddingBatch:
    last_id: uuid.UUID | None
    written: int = 0


@cache
def _embedder() -> Embedder:
    return Embedder(settings.ATS_EMBEDDING_MODEL_DIR or None)


def _candidate_ready() -> ColumnElement[bool]:
    candidates = Candidate.__table__
    documents = CvDocument.__table__
    latest_status = (
        select(documents.c.status)
        .where(
            documents.c.org_id == candidates.c.org_id,
            documents.c.candidate_id == candidates.c.id,
        )
        .order_by(documents.c.created_at.desc(), documents.c.id.desc())
        .limit(1)
        .correlate(candidates)
        .scalar_subquery()
    )
    return and_(
        candidates.c.parsed_data["schema_version"].astext.in_(("1.0", SCHEMA_VERSION)),
        or_(
            latest_status.is_(None),  # Historical profiles with no uploaded document.
            latest_status == CvStatus.PARSED.value,
            and_(
                latest_status == CvStatus.NEEDS_REVIEW.value,
                candidates.c.parsed_profile_reviewed_at.is_not(None),
            ),
        ),
    )


def embed_batch(
    sessions: sessionmaker[Session],
    kind: EmbeddingKind,
    *,
    after: uuid.UUID | None = None,
    limit: int = BATCH_SIZE,
    include_stale: bool = False,
) -> EmbeddingBatch:
    """Process a bounded page of work. Only backfill replaces vectors from older models."""
    fields: tuple[str, ...]
    if kind == "candidates":
        table = cast(Table, Candidate.__table__)
        fields = ("parsed_data",)
        criteria = [_candidate_ready()]
    else:
        table = cast(Table, Job.__table__)
        fields = JOB_EMBEDDING_FIELDS
        criteria = []

    version = table.c.embedding_model_version
    if include_stale:
        criteria.append(version.is_distinct_from(EMBEDDING_MODEL_VERSION))
    else:
        criteria.append(version.is_(None))
    query = (
        select(table.c.id, table.c.updated_at, version, *(table.c[field] for field in fields))
        .where(*criteria)
        .order_by(table.c.id)
        .limit(limit)
    )
    if after is not None:
        query = query.where(table.c.id > after)
    with sessions() as db:
        rows = db.execute(query).mappings().all()
    if not rows:
        return EmbeddingBatch(last_id=None)

    # Inference uses snapshots after closing the read transaction.
    model = _embedder()
    if kind == "candidates":
        vectors = model.embed_candidates(row["parsed_data"] for row in rows)
    else:
        vectors = model.embed_jobs({field: row[field] for field in fields} for row in rows)

    written = 0
    with sessions() as db:
        for row, vector in zip(rows, vectors, strict=True):
            # A correction or another worker may have replaced the snapshot during inference.
            statement = (
                update(table)
                .where(
                    *criteria,
                    table.c.id == row["id"],
                    table.c.updated_at == row["updated_at"],
                    version.is_not_distinct_from(row["embedding_model_version"]),
                )
                .values(
                    embedding=vector,
                    # Record empty, fully redacted input too, so it isn't retried forever.
                    embedding_model_version=EMBEDDING_MODEL_VERSION,
                    updated_at=table.c.updated_at,
                )
                .returning(table.c.id)
            )
            if db.scalar(statement) is not None:
                written += 1
        db.commit()
    return EmbeddingBatch(last_id=rows[-1]["id"], written=written)


def _embed_pending(sessions: sessionmaker[Session]) -> int:
    candidates = embed_batch(sessions, "candidates")
    jobs = embed_batch(sessions, "jobs")
    return candidates.written + jobs.written


async def embed_pending(ctx: dict[str, Any]) -> int:
    """Arq task. Missing versions are durable work markers set by committed source writes."""
    if not settings.ATS_EMBEDDING_MODEL_DIR:
        return 0
    sessions: sessionmaker[Session] = ctx.get("sessions") or SessionLocal
    return await asyncio.to_thread(_embed_pending, sessions)
