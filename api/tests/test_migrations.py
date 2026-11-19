"""Tests for Alembic Database Migration Upgrade & Downgrade Lifecycle."""

import os

from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command
from app.core.config import settings
from app.models import Base


def _check_embedding_schema(engine_url: str, *, version_column: bool) -> None:
    engine = create_engine(engine_url)
    with engine.connect() as conn:
        for table in ("candidates", "jobs"):
            assert (
                conn.scalar(
                    text(
                        "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
                        "WHERE attrelid = to_regclass(:table) AND attname = 'embedding'"
                    ),
                    {"table": table},
                )
                == "vector(384)"
            )
            definition = conn.scalar(
                text("SELECT indexdef FROM pg_indexes WHERE indexname = :index"),
                {"index": f"idx_{table}_embedding_hnsw"},
            )
            assert (
                definition is not None and "USING hnsw (embedding vector_cosine_ops)" in definition
            )
            has_version = conn.scalar(
                text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = :table "
                    "AND column_name = 'embedding_model_version')"
                ),
                {"table": table},
            )
            assert has_version is version_column
            pending = conn.scalar(
                text("SELECT indexdef FROM pg_indexes WHERE indexname = :index"),
                {"index": f"ix_{table}_embeddings_pending"},
            )
            if version_column:
                assert pending is not None and "embedding_model_version IS NULL" in pending
                if table == "candidates":
                    assert "embedding_ready" in pending
            else:
                assert pending is None
    engine.dispose()


def test_alembic_migration_lifecycle() -> None:
    """Test alembic upgrade head and alembic downgrade base cycle."""
    # Ensure database is clean before migrations
    engine = create_engine(settings.DATABASE_URL)
    Base.metadata.drop_all(engine)
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        conn.commit()
    engine.dispose()
    # Locate alembic.ini from api root
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_cfg = Config(os.path.join(base_dir, "alembic.ini"))

    # Test downgrade to base
    command.downgrade(alembic_cfg, "base")

    # Test upgrade to head from empty schema
    command.upgrade(alembic_cfg, "head")
    _check_embedding_schema(settings.DATABASE_URL, version_column=True)

    # B-17 round trip leaves the original vector columns and indexes in place.
    command.downgrade(alembic_cfg, "010_candidate_duplicate_warnings")
    _check_embedding_schema(settings.DATABASE_URL, version_column=False)
    with engine.begin() as conn:
        conn.execute(
            text("""
            WITH tenant AS (
                INSERT INTO organizations (name, slug) VALUES ('Migration test', 'migration-test')
                RETURNING id
            )
            INSERT INTO candidates (org_id, full_name, email, parsed_data)
            SELECT id, 'Example Candidate', 'candidate@example.org', '{"schema_version":"1.0"}'
            FROM tenant
        """)
        )
        conn.execute(
            text("""
            INSERT INTO cv_documents (
                org_id, candidate_id, storage_key, original_filename, content_type,
                size_bytes, sha256, status, created_at
            )
            SELECT c.org_id, c.id, d.status, 'cv.pdf', 'application/pdf',
                100, repeat('a', 64), d.status, now() + d.delay
            FROM candidates AS c CROSS JOIN (
                VALUES ('parsed', interval '0 seconds'), ('failed', interval '1 second')
            ) AS d(status, delay)
            WHERE c.email = 'candidate@example.org'
        """)
        )
    command.upgrade(alembic_cfg, "head")
    _check_embedding_schema(settings.DATABASE_URL, version_column=True)
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT embedding_ready FROM candidates")) is True

    # Verify downgrade again to test clean rollback
    command.downgrade(alembic_cfg, "base")

    # Re-apply upgrade to head for remaining tests
    command.upgrade(alembic_cfg, "head")
    engine.dispose()
