"""Backfill missing or outdated embeddings using the configured offline model."""

import argparse
import uuid

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.embedding_pipeline import BATCH_SIZE, EmbeddingKind, embed_batch


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args(argv)
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")
    if not settings.ATS_EMBEDDING_MODEL_DIR:
        parser.error("Set ATS_EMBEDDING_MODEL_DIR to the downloaded local model folder.")

    kinds: tuple[EmbeddingKind, ...] = ("candidates", "jobs")
    for kind in kinds:
        after: uuid.UUID | None = None
        written = 0
        while True:
            batch = embed_batch(
                SessionLocal, kind, after=after, limit=args.batch_size, include_stale=True
            )
            if batch.last_id is None:
                break
            after = batch.last_id
            written += batch.written
        print(f"{kind}: processed {written}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
