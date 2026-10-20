"""Shape of a score, and the parsed-CV schema shared with the backend and the frontend."""

import json
from importlib import resources
from typing import Any, TypedDict

from ats_scoring.parsed_cv import SCHEMA_VERSION

# Version the parser writes into new records. The schema file accepts this one and any
# older version that is still compatible.
PARSED_CV_SCHEMA_VERSION = SCHEMA_VERSION

# The draft shape (`work_history`, skills as plain strings) that the synthetic data and the
# evaluation set still use. The scorer reads it too. It does not validate against the schema.
LEGACY_SCHEMA_VERSION = "0.1"


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


def _load(*path: str) -> dict[str, Any]:
    text = resources.files("ats_scoring").joinpath("schemas", *path).read_text(encoding="utf-8")
    data: dict[str, Any] = json.loads(text)
    return data


def load_parsed_cv_schema() -> dict[str, Any]:
    """Return the JSON Schema (draft 2020-12) for a parsed CV."""
    return _load("parsed_cv.schema.json")


def load_parsed_cv_example() -> dict[str, Any]:
    """Return an example parsed CV that is valid under the schema."""
    return _load("fixtures", "valid", "full.json")


def fixture_names(kind: str) -> list[str]:
    """Names of the fixtures in schemas/fixtures/valid or schemas/fixtures/invalid."""
    folder = resources.files("ats_scoring").joinpath("schemas", "fixtures", kind)
    return sorted(item.name.removesuffix(".json") for item in folder.iterdir() if item.is_file())


def load_parsed_cv_fixture(kind: str, name: str) -> dict[str, Any]:
    """Load one fixture, where `kind` is "valid" or "invalid". Other teams' tests can use them."""
    return _load("fixtures", kind, f"{name}.json")
