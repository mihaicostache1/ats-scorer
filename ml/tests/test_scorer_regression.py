"""Scorer regression tests (L-19): frozen pairs whose results may only move on purpose.

Eleven candidate/job pairs, with their inputs and embedding vectors, are frozen in
tests/data/scorer_regression/ by evaluation/freeze_regression_pairs.py. Each must keep its total
within the frozen range, its band and its matched skills. Changing weights.yaml, the embedding
model or the skill taxonomy fails here even when no score moves, until the expected values are
frozen again in the same PR with a note saying why.
"""

import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from ats_scoring.config import DEFAULT_CONFIG

ML = Path(__file__).resolve().parents[1]
HOW_TO_UPDATE = (
    "If the change is intended, run "
    '`python evaluation/freeze_regression_pairs.py --note "why the values change"` in ml/ '
    "and commit tests/data/scorer_regression/ in the same PR."
)


def load_script() -> ModuleType:
    path = ML / "evaluation" / "freeze_regression_pairs.py"
    spec = importlib.util.spec_from_file_location("freeze_regression_pairs", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


freeze = load_script()


def _read(name: str) -> Any:
    path = freeze.OUT_DIR / name
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


EXPECTED = _read(freeze.EXPECTED_FILE)
INPUTS = _read(freeze.INPUTS_FILE)
VECTORS = _read(freeze.VECTORS_FILE)
PAIRS: list[dict[str, Any]] = EXPECTED["pairs"] if EXPECTED else []


@pytest.fixture(scope="module")
def expected() -> dict[str, Any]:
    if EXPECTED is None or INPUTS is None or VECTORS is None:
        pytest.fail(f"tests/data/scorer_regression/ is incomplete. {HOW_TO_UPDATE}")
    return dict(EXPECTED)


def test_the_frozen_pairs_are_the_listed_ones(expected: dict[str, Any]) -> None:
    listed = [freeze.pair_id(c, j, with_vectors) for c, j, with_vectors, _ in freeze.PAIRS]

    assert [pair["id"] for pair in PAIRS] == listed, HOW_TO_UPDATE
    assert 8 <= len(PAIRS) <= 15
    for pair in PAIRS:  # the ranges in the file were not widened by hand
        assert pair["total_max"] - pair["total_min"] <= 2 * expected["tolerance"] + 1e-9


def test_settings_are_the_ones_the_pairs_were_frozen_with(expected: dict[str, Any]) -> None:
    frozen = expected["fingerprint"]
    changed = [name for name, value in freeze.fingerprint().items() if frozen.get(name) != value]

    assert not changed, f"{', '.join(changed)} changed since the freeze. {HOW_TO_UPDATE}"


def test_every_freeze_says_why(expected: dict[str, Any]) -> None:
    history = expected["history"]

    assert history, "the regression pairs have no history"
    assert history[-1]["fingerprint"] == expected["fingerprint"], (
        f"the latest change to the expected values has no note. {HOW_TO_UPDATE}"
    )
    for entry in history:
        assert entry["date"] and len(entry["note"].strip()) >= 15, entry


def test_the_frozen_vectors_come_from_the_current_model(expected: dict[str, Any]) -> None:
    settings = DEFAULT_CONFIG.embedding

    assert (VECTORS["model"], VECTORS["revision"]) == (settings.model, settings.revision), (
        f"Rebuild evaluation/data/embeddings.json with embed_eval_set.py first. {HOW_TO_UPDATE}"
    )


@pytest.mark.parametrize("pair", PAIRS, ids=[pair["id"] for pair in PAIRS])
def test_a_frozen_pair_keeps_its_result(expected: dict[str, Any], pair: dict[str, Any]) -> None:
    result = freeze.score_pair(
        INPUTS, VECTORS, pair["candidate_id"], pair["job_id"], pair["embeddings"]
    )

    assert pair["total_min"] <= result["total"] <= pair["total_max"], (
        f"total {result['total']}, frozen at {pair['frozen_total']} "
        f"(allowed {pair['total_min']} to {pair['total_max']}). {HOW_TO_UPDATE}"
    )
    assert result["explanation"]["band"] == pair["band"], HOW_TO_UPDATE
    assert result["matched_skills"] == pair["matched_skills"], HOW_TO_UPDATE
