"""The saved fields used to build embeddings and invalidate them on edits."""

from typing import Any

from ats_scoring.embeddings import candidate_embedding_text
from sqlalchemy.orm.attributes import flag_modified

from app.models.candidate import Candidate
from app.models.job import Job

JOB_EMBEDDING_FIELDS = ("title", "description", "required_skills", "preferred_skills")


def profile_name(profile: dict[str, Any]) -> str | None:
    contact = profile.get("contact")
    name = contact.get("name") if isinstance(contact, dict) else None
    return name if isinstance(name, str) and name.strip() else None


def candidate_input(
    profile: dict[str, Any], full_name: str, original_name: str | None, aliases: list[str]
) -> str:
    names = [full_name, *aliases]
    if original_name:
        names.append(original_name)
    text: str = candidate_embedding_text(profile, additional_names=names)
    return text


def saved_candidate_input(candidate: Candidate) -> str:
    return candidate_input(
        candidate.parsed_data,
        candidate.full_name,
        profile_name(candidate.parsed_data_original),
        candidate.embedding_name_aliases,
    )


def remember_candidate_names(candidate: Candidate) -> None:
    """Keep names free text can still contain after a name or CV changes."""
    names = (
        candidate.full_name,
        profile_name(candidate.parsed_data),
        profile_name(candidate.parsed_data_original),
    )
    candidate.embedding_name_aliases = list(
        dict.fromkeys([*candidate.embedding_name_aliases, *(name for name in names if name)])
    )


def invalidate_embedding(record: Candidate | Job) -> None:
    record.embedding = None
    record.embedding_model_version = None
    # Force both columns into the source UPDATE even when the loaded values were NULL.
    # The worker may have filled them after the source row was read.
    flag_modified(record, "embedding")
    flag_modified(record, "embedding_model_version")
