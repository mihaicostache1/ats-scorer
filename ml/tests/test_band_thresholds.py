"""Tests for the band-threshold search (L-18): evaluation/band_thresholds.py."""

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from ats_scoring.config import BandSettings


def load() -> ModuleType:
    path = Path(__file__).resolve().parents[1] / "evaluation" / "band_thresholds.py"
    spec = importlib.util.spec_from_file_location("band_thresholds", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bt = load()


def rows(*pairs: tuple[float, float], job: str = "J01") -> list[dict[str, Any]]:
    return [{"job_id": job, "total": total, "rating": rating} for total, rating in pairs]


@pytest.mark.parametrize(
    ("rating", "expected"),
    [(3, "strong"), (2, "moderate"), (1, "weak"), (0, "weak"), (2.5, "strong")],
)
def test_each_rating_has_a_target_band(rating: float, expected: str) -> None:
    assert bt.target(rating) == expected


def test_the_halves_are_the_l9_and_l15_jobs() -> None:
    assert set(bt.FIT_JOBS) == {"J01", "J07", "J10"}
    assert set(bt.CHECK_JOBS) == {"J04", "J09", "J13"}


def test_thresholds_are_multiples_of_5_with_moderate_below_strong() -> None:
    tried = list(bt.candidate_thresholds())
    assert all(b.moderate < b.strong and b.moderate % 5 == 0 == b.strong % 5 for b in tried)
    assert BandSettings(strong=70, moderate=50) in tried
    assert len(tried) == 171  # 19 multiples of 5 from 5 to 95, two at a time


def test_kappa_is_1_when_every_band_is_right_and_drops_with_far_errors() -> None:
    bands = BandSettings(strong=70, moderate=50)
    right = rows((80, 3), (60, 2), (30, 1), (10, 0))
    near = rows((60, 3), (60, 2), (30, 1), (10, 0))  # a 3 in moderate
    far = rows((30, 3), (60, 2), (30, 1), (10, 0))  # a 3 in weak

    assert bt.kappa(right, bands) == pytest.approx(1.0)
    assert bt.kappa(right, bands) > bt.kappa(near, bands) > bt.kappa(far, bands)
    assert (bt.two_band_errors(near, bands), bt.two_band_errors(far, bands)) == (0, 1)


def test_search_finds_a_clean_split_and_takes_the_middle_of_ties() -> None:
    # Strong from anything in (62, 90], moderate from anything in (40, 60]: all tie.
    data = rows((92, 3), (90, 3), (62, 2), (60, 2), (40, 1), (20, 0))

    picked, top, tied = bt.search(data)

    assert top[0]["kappa"] == pytest.approx(1.0)
    assert tied == 6 * 4  # strong 65 to 90, moderate 45 to 60
    assert picked == BandSettings(strong=75, moderate=50)  # lower medians


def test_table_counts_ratings_per_band() -> None:
    result = bt.table(rows((80, 3), (75, 1), (60, 3), (30, 0)), BandSettings(70, 50))

    assert result["bands"]["strong"]["ratings"] == {"3": 1, "2": 0, "1": 1, "0": 0}
    assert result["bands"]["strong"]["precision"] == 0.5
    assert result["bands"]["strong"]["recall"] == 0.5
    assert result["bands"]["moderate"]["precision"] == 0.0
    assert result["exact_agreement"] == 0.5
    assert result["two_band_errors"] == 1
