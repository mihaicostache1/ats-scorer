"""Tests for weights.yaml and its loader."""

import copy
import math
from pathlib import Path
from typing import Any

import pytest
import yaml

from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG, load_config, parse_config

SHIPPED = Path(__file__).resolve().parents[1] / "ats_scoring" / "weights.yaml"


def shipped() -> dict[str, Any]:
    data: dict[str, Any] = yaml.safe_load(SHIPPED.read_text(encoding="utf-8"))
    return data


def test_shipped_file_is_valid_and_is_the_default() -> None:
    assert load_config(SHIPPED) == DEFAULT_CONFIG == load_config()


def test_shipped_weights_cover_every_component_and_add_up_to_1() -> None:
    assert list(DEFAULT_CONFIG.weights) == list(COMPONENTS)
    assert math.isclose(sum(DEFAULT_CONFIG.weights.values()), 1.0)


def test_required_skills_weigh_more_than_preferred_ones() -> None:
    assert DEFAULT_CONFIG.required_skill_weight > DEFAULT_CONFIG.preferred_skill_weight


def test_embedding_model_is_pinned_to_a_revision() -> None:
    assert DEFAULT_CONFIG.embedding.model == "intfloat/multilingual-e5-small"
    assert len(DEFAULT_CONFIG.embedding.revision) == 40  # a full commit hash


def _broken(path: tuple[str, ...], value: Any) -> dict[str, Any]:
    data = copy.deepcopy(shipped())
    target = data
    for key in path[:-1]:
        target = target[key]
    if value is KeyError:
        del target[path[-1]]
    else:
        target[path[-1]] = value
    return data


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (("weights", "skill_overlap"), 0.9, "add up to 1"),
        (("weights", "skill_overlap"), KeyError, "exactly"),
        (("weights", "extra"), 0.0, "exactly"),
        (("weights", "skill_overlap"), "high", "must be a number"),
        (("weights", "skill_overlap"), True, "must be a number"),
        (("skills", "preferred_weight"), 1.0, "below required_weight"),
        (("skills", "preferred_weight"), -0.1, "below required_weight"),
        (("embedding", "cosine_floor"), 0.99, "cosine_floor < cosine_ceiling"),
        (("embedding", "dimensions"), 0, "positive integer"),
        (("embedding", "revision"), "", "non-empty string"),
        (("title", "older_title_factor"), 1.5, "from 0 to 1"),
        (("model_version",), None, "non-empty string"),
        (("skills",), [], "must be a mapping"),
    ],
)
def test_invalid_settings_are_rejected(path: tuple[str, ...], value: Any, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        parse_config(_broken(path, value))


def test_negative_weight_is_rejected() -> None:
    data = shipped()
    data["weights"]["skill_overlap"] += 0.5
    data["weights"]["text_similarity"] -= 0.5
    with pytest.raises(ValueError, match="negative"):
        parse_config(data)


def test_a_file_that_is_not_a_mapping_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "weights.yaml"
    path.write_text("- just\n- a list\n", encoding="utf-8")
    with pytest.raises(ValueError, match="mapping"):
        load_config(path)
