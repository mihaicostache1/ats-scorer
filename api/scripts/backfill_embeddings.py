"""Backfill missing or outdated embeddings using the configured offline model."""

import argparse
import sys
import uuid

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.embedding_pipeline import BATCH_SIZE, EMBEDDING_KINDS, embed_batch

MAX_CONFLICT_RETRIES = 3


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args(argv)
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")
    if not settings.ATS_EMBEDDING_MODEL_DIR:
        parser.error("Set ATS_EMBEDDING_MODEL_DIR to the downloaded local model folder.")

    incomplete = False
    for kind in EMBEDDING_KINDS:
        after: uuid.UUID | None = None
        written = 0
        conflicts = 0
        while True:
            batch = embed_batch(
                SessionLocal, kind, after=after, limit=args.batch_size, include_stale=True
            )
            if batch.last_id is None:
                break
            after = batch.last_id
            written += batch.written
            pending = batch.conflicts
            for _ in range(MAX_CONFLICT_RETRIES):
                if not pending:
                    break
                retry = embed_batch(
                    SessionLocal, kind, limit=len(pending), include_stale=True, ids=pending
                )
                written += retry.written
                pending = retry.conflicts
            conflicts += len(pending)
        print(f"{kind}: processed {written}")
        if conflicts:
            incomplete = True
            print(f"{kind}: {conflicts} rows kept changing. Run backfill again.", file=sys.stderr)
    return int(incomplete)


if __name__ == "__main__":
    raise SystemExit(main())
