"""Tests for Alembic Database Migration Upgrade & Downgrade Lifecycle."""

import os

from alembic.config import Config

from alembic import command


def test_alembic_migration_lifecycle() -> None:
    """Test alembic upgrade head and alembic downgrade base cycle."""
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
