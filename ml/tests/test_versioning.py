"""Tests for model_version (L-21): stable for the same scorer, different when anything changes."""

import copy
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from ats_scoring import MODEL_VERSION, ModelVersion, get_model_version, parse_model_version
from ats_scoring.config import DEFAULT_CONFIG, load_config, parse_config
from ats_scoring.skills import SKILL_ALIASES
from ats_scoring.titles import TITLE_SYNONYMS
from ats_scoring.versioning import MAX_LENGTH, model_version_parts

SHIPPED = Path(__file__).resolve().parents[1] / "ats_scoring" / "weights.yaml"
CURRENT = model_version_parts()  # taken before any test changes a vocabulary


def shipped() -> dict[str, Any]:
    data: dict[str, Any] = yaml.safe_load(SHIPPED.read_text(encoding="utf-8"))
    return data


def version_of(data: dict[str, Any]) -> str:
    return get_model_version(parse_config(data))


# --------------------------------------------------------------------------- stable


def test_the_version_is_the_scorer_version_and_three_hashes() -> None:
    parts = parse_model_version(MODEL_VERSION)

    assert parts is not None
    assert parts.scorer == DEFAULT_CONFIG.scorer_version
    assert str(parts) == MODEL_VERSION == get_model_version()
    assert len(MODEL_VERSION) <= MAX_LENGTH  # fits scores.model_version


def test_the_same_settings_give_the_same_version() -> None:
    assert get_model_version(load_config(SHIPPED)) == get_model_version(load_config())
    assert version_of(shipped()) == version_of(shipped()) == MODEL_VERSION


@pytest.mark.parametrize("seed", ["0", "1", "12345"])
def test_the_version_does_not_depend_on_the_process(seed: str) -> None:
    # Sets iterate in a different order under another hash seed; the version must not.
    code = "from ats_scoring import MODEL_VERSION; print(MODEL_VERSION)"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    output = subprocess.run(
        [sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True
    )

    assert output.stdout.strip() == MODEL_VERSION


def test_comments_key_order_and_number_spelling_do_not_count(tmp_path: Path) -> None:
    data = shipped()
    reordered = dict(reversed(list(data.items())))
    reordered["weights"] = dict(reversed(list(data["weights"].items())))
    reordered["bands"] = {"moderate": 50.0, "strong": 70.0}  # 70 and 50 in the shipped file
    path = tmp_path / "weights.yaml"
    text = yaml.safe_dump(reordered, sort_keys=False)
    path.write_text("# another comment\n" + text, encoding="utf-8")

    assert isinstance(data["bands"]["strong"], int)
    assert get_model_version(load_config(path)) == MODEL_VERSION


# --------------------------------------------------------------------------- changes


def _shift_weight(data: dict[str, Any]) -> None:
    data["weights"]["skill_overlap"] += 0.05
    data["weights"]["text_similarity"] -= 0.05


def _set(*path: str, value: Any) -> Callable[[dict[str, Any]], None]:
    def change(data: dict[str, Any]) -> None:
        target = data
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value

    return change


@pytest.mark.parametrize(
    ("change", "part"),
    [
        (_shift_weight, "weights"),
        (_set("skills", "preferred_weight", value=0.4), "weights"),
        (_set("bands", "strong", value=75), "weights"),
        (_set("embedding", "cosine_floor", value=0.78), "weights"),
        (_set("title", "older_title_factor", value=0.7), "weights"),
        (_set("embedding", "model", value="intfloat/multilingual-e5-base"), "embedding"),
        (_set("embedding", "revision", value="0" * 40), "embedding"),
        (_set("scorer_version", value="hybrid-1.3.0"), "scorer"),
    ],
    ids=[
        "weights",
        "skill weight",
        "band",
        "cosine range",
        "title factor",
        "embedding model",
        "embedding revision",
        "scorer version",
    ],
)
def test_a_change_moves_the_version_and_names_the_part(
    change: Callable[[dict[str, Any]], None], part: str
) -> None:
    data = copy.deepcopy(shipped())
    change(data)
    config = parse_config(data)

    assert get_model_version(config) != MODEL_VERSION
    assert model_version_parts(config).changed(CURRENT) == [part]


def test_a_skill_alias_moves_the_taxonomy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(SKILL_ALIASES, "tf", "terraform")

    assert get_model_version() != MODEL_VERSION
    assert model_version_parts().changed(CURRENT) == ["taxonomy"]


def test_a_title_synonym_moves_the_taxonomy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(TITLE_SYNONYMS, "coder", "engineer")

    assert model_version_parts().changed(CURRENT) == ["taxonomy"]


# --------------------------------------------------------------------------- parsing


def test_a_version_reads_back_into_its_parts() -> None:
    parts = ModelVersion(
        scorer="hybrid-2.0.0", weights="0" * 8, embedding="a" * 8, taxonomy="f" * 8
    )

    assert parse_model_version(str(parts)) == parts


@pytest.mark.parametrize(
    "text", ["hybrid-1.2.0", "tfidf-skills-0.1.0", "v1.0.0-baseline-cpu", "hybrid-1.2.0+w.xyz"]
)
def test_a_version_from_before_l21_has_no_parts(text: str) -> None:
    assert parse_model_version(text) is None


def test_a_scorer_version_too_long_for_the_column_is_rejected() -> None:
    data = shipped()
    data["scorer_version"] = "hybrid-" + "1" * 20

    with pytest.raises(ValueError, match=f"longer than {MAX_LENGTH}"):
        version_of(data)
