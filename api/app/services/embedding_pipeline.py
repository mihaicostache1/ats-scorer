"""Fill versioned embeddings from saved profiles and postings."""

import asyncio
import uuid
from dataclasses import dataclass
from functools import cache
from time import monotonic
from typing import Any, Literal, cast, get_args

from ats_scoring.config import DEFAULT_CONFIG
from ats_scoring.embeddings import Embedder
from ats_scoring.parsed_cv import ParsedCV
from sqlalchemy import ColumnElement, Table, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.candidate import Candidate
from app.models.job import Job
from app.services.embedding_inputs import JOB_EMBEDDING_FIELDS, candidate_input

BATCH_SIZE = 32
WORKER_BUDGET_SECONDS = 60
EmbeddingKind = Literal["candidates", "jobs"]
EMBEDDING_KINDS: tuple[EmbeddingKind, ...] = ("candidates", "jobs")
EMBEDDING_MODEL_VERSION = f"{DEFAULT_CONFIG.embedding.model}@{DEFAULT_CONFIG.embedding.revision}"
_PROFILE_VERSIONS = get_args(ParsedCV.model_fields["schema_version"].annotation)


@dataclass(frozen=True)
class EmbeddingBatch:
    last_id: uuid.UUID | None
    written: int = 0
    conflicts: tuple[uuid.UUID, ...] = ()


@cache
def _embedder() -> Embedder:
    return Embedder(settings.ATS_EMBEDDING_MODEL_DIR or None)


def embed_batch(
    sessions: sessionmaker[Session],
    kind: EmbeddingKind,
    *,
    after: uuid.UUID | None = None,
    limit: int = BATCH_SIZE,
    include_stale: bool = False,
    ids: tuple[uuid.UUID, ...] | None = None,
) -> EmbeddingBatch:
    """Process a bounded page of work. Only backfill replaces vectors from older models."""
    inputs: tuple[ColumnElement[Any], ...]
    if kind == "candidates":
        table = cast(Table, Candidate.__table__)
        inputs = (
            table.c.parsed_data,
            table.c.full_name,
            table.c.parsed_data_original["contact"]["name"].astext.label("original_name"),
            table.c.embedding_name_aliases,
        )
        criteria = [
            table.c.embedding_ready,
            table.c.parsed_data["schema_version"].astext.in_(_PROFILE_VERSIONS),
        ]
    else:
        table = cast(Table, Job.__table__)
        inputs = tuple(table.c[field] for field in JOB_EMBEDDING_FIELDS)
        criteria = []

    version = table.c.embedding_model_version
    if include_stale:
        criteria.append(version.is_distinct_from(EMBEDDING_MODEL_VERSION))
    else:
        criteria.append(version.is_(None))
    query = (
        select(table.c.id, table.c.updated_at, version, *inputs)
        .where(*criteria)
        .order_by(table.c.id)
        .limit(limit)
    )
    if after is not None:
        query = query.where(table.c.id > after)
    if ids is not None:
        query = query.where(table.c.id.in_(ids))
    with sessions() as db:
        rows = db.execute(query).mappings().all()
    if not rows:
        return EmbeddingBatch(last_id=None)

    # Inference uses snapshots after closing the read transaction.
    model = _embedder()
    if kind == "candidates":
        vectors = model.embed_candidate_texts(
            [
                candidate_input(
                    row["parsed_data"],
                    row["full_name"],
                    row["original_name"],
                    row["embedding_name_aliases"],
                )
                for row in rows
            ]
        )
    else:
        vectors = model.embed_jobs(
            {field: row[field] for field in JOB_EMBEDDING_FIELDS} for row in rows
        )

    written = 0
    conflicts: list[uuid.UUID] = []
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
            else:
                conflicts.append(row["id"])
        db.commit()
    return EmbeddingBatch(last_id=rows[-1]["id"], written=written, conflicts=tuple(conflicts))


def _embed_pending(sessions: sessionmaker[Session]) -> int:
    deadline = monotonic() + WORKER_BUDGET_SECONDS
    after: dict[EmbeddingKind, uuid.UUID | None] = dict.fromkeys(EMBEDDING_KINDS)
    written = 0
    # Alternate kinds and advance the cursor so a repeatedly edited row can't stall the worker.
    while after:
        for kind in tuple(after):
            batch = embed_batch(sessions, kind, after=after[kind])
            written += batch.written
            if batch.last_id is None:
                del after[kind]
            else:
                after[kind] = batch.last_id
            if monotonic() >= deadline:
                return written
    return written


async def embed_pending(ctx: dict[str, Any]) -> int:
    """Arq task. Missing versions are durable work markers set by committed source writes."""
    if not settings.ATS_EMBEDDING_MODEL_DIR:
        return 0
    sessions: sessionmaker[Session] = ctx.get("sessions") or SessionLocal
    return await asyncio.to_thread(_embed_pending, sessions)
