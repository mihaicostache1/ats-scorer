"""B-15 migration upgrades and rolls back without altering existing workspace members."""

from collections.abc import Callable
from pathlib import Path

from alembic.config import Config
from sqlalchemy import Engine, inspect
from sqlalchemy.orm import Session

from alembic import command
from app.models.user import User
from app.models.user_invitation import UserInvitation


def test_invitation_migration_upgrade_and_downgrade(
    db_engine: Engine, create_user: Callable[..., User]
) -> None:
    admin = create_user()
    UserInvitation.__table__.drop(db_engine)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(config, "007_parsed_profile_review")

    command.upgrade(config, "head")
    inspector = inspect(db_engine)
    assert set(UserInvitation.__table__.columns.keys()) == {
        column["name"] for column in inspector.get_columns("user_invitations")
    }
    assert any(
        constraint["column_names"] == ["token_hash"]
        for constraint in inspector.get_unique_constraints("user_invitations")
    )
    assert len(inspector.get_foreign_keys("user_invitations")) == 3

    command.downgrade(config, "007_parsed_profile_review")
    assert not inspect(db_engine).has_table("user_invitations")
    with Session(db_engine) as db:
        assert db.get(User, admin.id) is not None
    command.upgrade(config, "head")
    assert inspect(db_engine).has_table("user_invitations")
