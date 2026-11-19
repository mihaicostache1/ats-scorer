"""Scorer settings: the weights, the model version and the embedding model, from weights.yaml."""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any

import yaml

# The components of a score, in the order they are reported.
COMPONENTS = (
    "skill_overlap",
    "embedding_similarity",
    "experience_fit",
    "title_similarity",
    "text_similarity",
)


@dataclass(frozen=True)
class EmbeddingSettings:
    model: str
    revision: str
    dimensions: int
    cosine_floor: float
    cosine_ceiling: float


@dataclass(frozen=True)
class ScorerConfig:
    model_version: str
    weights: Mapping[str, float]
    required_skill_weight: float
    preferred_skill_weight: float
    embedding: EmbeddingSettings
    older_title_factor: float


def _section(data: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = data.get(key)
    if not isinstance(value, Mapping):
        raise ValueError(f"weights.yaml: '{key}' must be a mapping")
    return value


def _number(section: Mapping[str, Any], key: str, where: str) -> float:
    value = section.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise ValueError(f"weights.yaml: '{where}.{key}' must be a number, not {value!r}")
    return float(value)


def _text(section: Mapping[str, Any], key: str, where: str) -> str:
    value = section.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"weights.yaml: '{where}{key}' must be a non-empty string")
    return value


def parse_config(data: Mapping[str, Any]) -> ScorerConfig:
    """Check the settings and turn them into a ScorerConfig. Raises ValueError if invalid."""
    weights_section = _section(data, "weights")
    if set(weights_section) != set(COMPONENTS):
        raise ValueError(
            f"weights.yaml: 'weights' must list exactly {', '.join(COMPONENTS)}, "
            f"not {', '.join(sorted(map(str, weights_section)))}"
        )
    weights = {name: _number(weights_section, name, "weights") for name in COMPONENTS}
    if any(weight < 0 for weight in weights.values()):
        raise ValueError("weights.yaml: weights cannot be negative")
    if not math.isclose(sum(weights.values()), 1.0, abs_tol=1e-9):
        raise ValueError(f"weights.yaml: weights must add up to 1, not {sum(weights.values())}")

    skills = _section(data, "skills")
    required = _number(skills, "required_weight", "skills")
    preferred = _number(skills, "preferred_weight", "skills")
    if not 0 <= preferred < required:
        raise ValueError(
            "weights.yaml: skills.preferred_weight must be at least 0 and below required_weight"
        )

    embedding = _section(data, "embedding")
    dimensions = embedding.get("dimensions")
    if isinstance(dimensions, bool) or not isinstance(dimensions, int) or dimensions < 1:
        raise ValueError("weights.yaml: 'embedding.dimensions' must be a positive integer")
    floor = _number(embedding, "cosine_floor", "embedding")
    ceiling = _number(embedding, "cosine_ceiling", "embedding")
    if not -1 <= floor < ceiling <= 1:
        raise ValueError("weights.yaml: need -1 <= embedding.cosine_floor < cosine_ceiling <= 1")

    older = _number(_section(data, "title"), "older_title_factor", "title")
    if not 0 <= older <= 1:
        raise ValueError("weights.yaml: 'title.older_title_factor' must be from 0 to 1")

    return ScorerConfig(
        model_version=_text(data, "model_version", ""),
        weights=weights,
        required_skill_weight=required,
        preferred_skill_weight=preferred,
        embedding=EmbeddingSettings(
            model=_text(embedding, "model", "embedding."),
            revision=_text(embedding, "revision", "embedding."),
            dimensions=dimensions,
            cosine_floor=floor,
            cosine_ceiling=ceiling,
        ),
        older_title_factor=older,
    )


def load_config(path: Path | str | None = None) -> ScorerConfig:
    """Read the settings from `path`, or from the weights.yaml shipped with the package."""
    if path is None:
        text = resources.files("ats_scoring").joinpath("weights.yaml").read_text(encoding="utf-8")
    else:
        text = Path(path).read_text(encoding="utf-8")
    data = yaml.safe_load(text)
    if not isinstance(data, Mapping):
        raise ValueError("weights.yaml must hold a mapping")
    return parse_config(data)


# The settings the scorer uses unless it is given others.
DEFAULT_CONFIG = load_config()
