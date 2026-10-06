"""Tests for Alembic Database Migration Upgrade & Downgrade Lifecycle."""

import os

from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command
from app.core.config import settings
from app.models import Base


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

    # Verify downgrade again to test clean rollback
    command.downgrade(alembic_cfg, "base")

    # Re-apply upgrade to head for remaining tests
    command.upgrade(alembic_cfg, "head")
