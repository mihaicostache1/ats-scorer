"""B-16 migration preserves candidates and refuses a lossy downgrade."""

from collections.abc import Callable
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import Engine, inspect, text
from sqlalchemy.orm import Session

from alembic import command
from app.models.candidate import Candidate
from app.models.user import User


def test_duplicate_email_migration_lifecycle(
    db_engine: Engine, create_user: Callable[..., User]
) -> None:
    admin = create_user()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    # create_all uses the new metadata; reproduce the B-15 constraint before upgrading.
    with db_engine.begin() as connection:
        connection.execute(text("DROP INDEX ix_candidates_org_email"))
        connection.execute(
            text(
                "ALTER TABLE candidates ADD CONSTRAINT uq_candidates_org_email "
                "UNIQUE (org_id, email)"
            )
        )
    command.stamp(config, "009_global_user_email")
    with Session(db_engine) as db:
        original = Candidate(org_id=admin.org_id, full_name="Original", email="shared@example.com")
        db.add(original)
        db.commit()
        original_id = original.id

    command.upgrade(config, "010_candidate_duplicate_warnings")
    assert "uq_candidates_org_email" not in {
        constraint["name"] for constraint in inspect(db_engine).get_unique_constraints("candidates")
    }
    assert any(
        index["name"] == "ix_candidates_org_email" and not index["unique"]
        for index in inspect(db_engine).get_indexes("candidates")
    )
    with Session(db_engine) as db:
        repeated = Candidate(org_id=admin.org_id, full_name="Separate", email="shared@example.com")
        db.add(repeated)
        db.commit()
        repeated_id = repeated.id
        assert db.get(Candidate, original_id) is not None

    with pytest.raises(RuntimeError, match="Resolve candidates sharing an email"):
        command.downgrade(config, "009_global_user_email")
    with Session(db_engine) as db:
        assert {row.id for row in db.query(Candidate).all()} == {original_id, repeated_id}
        # An explicit correction makes the original constraint safe to restore.
        repeated = db.get(Candidate, repeated_id)
        assert repeated is not None
        repeated.email = "separate@example.com"
        db.commit()
    command.downgrade(config, "009_global_user_email")
    assert "uq_candidates_org_email" in {
        constraint["name"] for constraint in inspect(db_engine).get_unique_constraints("candidates")
    }
    command.upgrade(config, "010_candidate_duplicate_warnings")
    with Session(db_engine) as db:
        assert db.query(Candidate).count() == 2
