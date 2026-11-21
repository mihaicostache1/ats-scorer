"""Pydantic models of the score explanation, version 1.0 (L-17).

The explanation is returned with every score, under `explanation`, and is what the detail view
shows (US-09). The JSON Schema in `schemas/score_explanation.schema.json` describes the same
shape for the backend and the frontend. Both are checked against the example payloads in
`schemas/examples/score_explanation/`, so they cannot drift apart unnoticed. Rules for changing
either: docs/ml/score-explanation.md.

Every text in it comes from a fixed template (`ats_scoring.explanation.TEMPLATES`), never from a
language model, and every value comes from the redacted CV: no name, contact detail or date.
"""

from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

EXPLANATION_VERSION: Final = "1.0"

NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]
Points = Annotated[float, Field(ge=0, le=100)]
Share = Annotated[float, Field(ge=0, le=1)]
Years = Annotated[float, Field(ge=0)]

Band = Literal["strong", "moderate", "weak"]
ComponentName = Literal[
    "skill_overlap",
    "embedding_similarity",
    "experience_fit",
    "title_similarity",
    "text_similarity",
]
Requirement = Literal["required", "preferred"]
# meets: has at least the minimum. below: has fewer years. not_required: the job gives no
# minimum, or 0. unknown: the CV gives no total years. Only meets and below are scored.
ExperienceStatus = Literal["meets", "below", "not_required", "unknown"]


class _Model(BaseModel):
    """Closed and strict, like the JSON Schema: an unknown field is an error."""

    model_config = ConfigDict(extra="forbid", strict=True)


class ComponentExplanation(_Model):
    """One part of the score and how much it added to the total."""

    name: ComponentName
    label: NonEmptyStr  # short name to show, e.g. "Skills"
    score: Points | None  # 0-100, or None when it could not be computed
    weight: Share  # share of the total actually applied; 0 when score is None
    contribution: Points  # points it added to the total: score x weight
    statement: NonEmptyStr  # one or two sentences from the templates


class MatchedSkill(_Model):
    """A job skill the candidate has."""

    skill: NonEmptyStr  # as the job writes it
    requirement: Requirement
    cv_phrase: NonEmptyStr  # as the CV writes it, e.g. "Postgres" for the job's "PostgreSQL"


class MissingSkills(_Model):
    required: list[NonEmptyStr]  # as the job writes them
    preferred: list[NonEmptyStr]  # nice-to-have skills


class ExperienceFit(_Model):
    status: ExperienceStatus
    candidate_years: Years | None  # total years from the CV, None when it gives none
    required_years: Years | None  # the job's minimum, None when it gives none
    statement: NonEmptyStr


class ScoreExplanation(_Model):
    """Why a candidate got their score. Stored in `scores.component_breakdown`."""

    explanation_version: Literal["1.0"]
    model_version: NonEmptyStr  # the scorer that produced it, as in `scores.model_version`
    total: Points
    band: Band
    summary: NonEmptyStr  # band, required skills and experience, in two or three sentences
    components: Annotated[list[ComponentExplanation], Field(min_length=5, max_length=5)]
    matched_skills: list[MatchedSkill]  # required first, then nice-to-have, in the job's order
    missing_skills: MissingSkills
    experience: ExperienceFit
    advisory_note: NonEmptyStr  # the score is advisory and can be wrong (US-09)
