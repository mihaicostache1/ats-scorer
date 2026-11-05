"""The benchmark's metric arithmetic must count omissions and additions."""

from pathlib import Path

import pytest

from scripts.evaluate_cv_parser import evaluate, skill_metrics


def test_metrics_penalize_extra_and_missing_skills() -> None:
    metrics = skill_metrics(tp=3, fp=1, fn=2)
    assert metrics["precision"] == 0.75
    assert metrics["recall"] == 0.6
    assert metrics["micro_f1"] == pytest.approx(2 / 3)
    assert skill_metrics(0, 0, 2)["micro_f1"] == 0


def test_empty_dataset_does_not_produce_a_passing_report(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="No synthetic ground-truth"):
        evaluate(tmp_path)
