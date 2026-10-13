"""Shape of a score, and the draft parsed-CV schema shared with the backend."""

import json
from importlib import resources
from typing import Any, TypedDict

# Version the parser writes into new records. The schema file accepts this one and any
# older version that is still compatible.
PARSED_CV_SCHEMA_VERSION = "0.1"


class ScoreComponents(TypedDict):
    """Parts of a score, each from 0 to 100."""

    skill_overlap: float | None  # None when the job lists no skills
    text_similarity: float


class ScoreResult(TypedDict):
    """What `score()` returns."""

    total: float  # 0-100
    components: ScoreComponents
    weights: dict[str, float]  # weight actually applied to each component
    matched_skills: list[str]
    missing_skills: list[str]
    score_explanations: list[str]  # plain-language reasons, for recruiters
    model_version: str


def _load(name: str) -> dict[str, Any]:
    text = (resources.files("ats_scoring") / "schemas" / name).read_text(encoding="utf-8")
    data: dict[str, Any] = json.loads(text)
    return data


def load_parsed_cv_schema() -> dict[str, Any]:
    """Return the JSON Schema (draft 2020-12) for a parsed CV."""
    return _load("parsed_cv.schema.json")


def load_parsed_cv_example() -> dict[str, Any]:
    """Return an example parsed CV that is valid under the schema."""
    return _load("parsed_cv.example.json")
