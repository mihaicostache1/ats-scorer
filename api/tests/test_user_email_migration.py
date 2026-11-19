"""Global email uniqueness migration preserves users and rejects ambiguous identities."""

from collections.abc import Callable
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.models.user import User


@pytest.fixture
def previous_schema(db_engine: Engine) -> Config:
    # create_all uses current metadata; reproduce the schema before the new index.
    with db_engine.begin() as connection:
        connection.execute(text("DROP INDEX uq_users_email_lower"))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(config, "008_user_invitations")
    return config


def test_global_email_migration_upgrade_and_downgrade(
    db_engine: Engine, previous_schema: Config, create_user: Callable[..., User]
) -> None:
    original = create_user()
    other = create_user()
    assert original.org_id != other.org_id
    original_email, other_email = original.email, other.email
    command.upgrade(previous_schema, "009_global_user_email")
    assert any(
        index["name"] == "uq_users_email_lower" and index["unique"]
        for index in inspect(db_engine).get_indexes("users")
    )
    with Session(db_engine) as db:
        duplicate = db.get(User, other.id)
        assert duplicate is not None
        duplicate.email = original_email.upper()
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        assert {user.id: user.email for user in db.query(User).all()} == {
            original.id: original_email,
            other.id: other_email,
        }

    command.downgrade(previous_schema, "008_user_invitations")
    assert "uq_users_email_lower" not in {
        index["name"] for index in inspect(db_engine).get_indexes("users")
    }
    with Session(db_engine) as db:
        assert db.query(User).count() == 2
    command.upgrade(previous_schema, "009_global_user_email")


def test_global_email_migration_refuses_existing_duplicates_without_changing_users(
    db_engine: Engine, previous_schema: Config, create_user: Callable[..., User]
) -> None:
    original = create_user()
    other = create_user()
    with Session(db_engine) as db:
        duplicate = db.get(User, other.id)
        assert duplicate is not None
        duplicate.email = original.email.upper()
        db.commit()
        before = {user.id: user.email for user in db.query(User).all()}

    with pytest.raises(RuntimeError, match="Resolve users sharing an email"):
        command.upgrade(previous_schema, "009_global_user_email")
    with Session(db_engine) as db:
        assert {user.id: user.email for user in db.query(User).all()} == before
        assert db.scalar(text("SELECT version_num FROM alembic_version")) == (
            "008_user_invitations"
        )
        # An explicit correction allows the migration to proceed without losing accounts.
        duplicate = db.get(User, other.id)
        assert duplicate is not None
        duplicate.email = other.email
        db.commit()
    command.upgrade(previous_schema, "009_global_user_email")
