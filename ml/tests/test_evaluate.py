"""Tests for the evaluation harness."""

import csv
import json
from pathlib import Path

import pytest

from ats_scoring import MODEL_VERSION, score
from ats_scoring.evaluate import (
    evaluate,
    load_scorer,
    main,
    ndcg_at_k,
    random_ndcg_at_k,
    rater_agreement,
    spearman,
)

JOB = {
    "title": "Backend Developer",
    "description": "Build REST services in Python.",
    "required_skills": ["Python", "Docker"],
}

CANDIDATES = {
    "C1": {
        "headline": "Backend Developer",
        "summary": "Builds REST services in Python.",
        "skills": ["Python", "Docker"],
    },
    "C2": {
        "headline": "Backend Developer",
        "summary": "Builds REST services.",
        "skills": ["Python"],
    },
    "C3": {"headline": "Pastry Chef", "summary": "Bakes bread.", "skills": ["Baking"]},
}


def write_eval_set(root: Path, ratings: list[tuple[str, str, object]]) -> None:
    """Create a tiny evaluation folder: one job, three candidates, one rater."""
    (root / "data" / "jobs").mkdir(parents=True)
    (root / "data" / "candidates").mkdir(parents=True)
    (root / "ratings").mkdir()
    (root / "data" / "jobs" / "J1.json").write_text(json.dumps(JOB), encoding="utf-8")
    for candidate_id, profile in CANDIDATES.items():
        path = root / "data" / "candidates" / f"{candidate_id}.json"
        path.write_text(json.dumps(profile), encoding="utf-8")
    with (root / "ratings" / "tester.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["candidate_id", "job_id", "rating"])
        writer.writerows(ratings)


GOOD_RATINGS = [("C1", "J1", 3), ("C2", "J1", 2), ("C3", "J1", 0)]


def test_spearman_of_same_and_opposite_order() -> None:
    assert spearman([0, 1, 2, 3], [10, 20, 30, 40]) == pytest.approx(1.0)
    assert spearman([0, 1, 2, 3], [40, 30, 20, 10]) == pytest.approx(-1.0)


def test_spearman_is_undefined_without_variation() -> None:
    assert spearman([2, 2, 2], [1, 2, 3]) is None


def test_ndcg_of_the_ideal_order_is_1() -> None:
    assert ndcg_at_k([3, 2, 0, 1], [0.9, 0.8, 0.1, 0.5]) == pytest.approx(1.0)


def test_ndcg_rewards_a_better_order() -> None:
    ratings = [3, 2, 1, 0]

    assert ndcg_at_k(ratings, [4, 3, 2, 1]) > ndcg_at_k(ratings, [1, 2, 3, 4])


def test_ndcg_is_undefined_when_no_candidate_is_relevant() -> None:
    assert ndcg_at_k([0, 0, 0], [1, 2, 3]) is None


def test_random_order_scores_below_the_ideal_order() -> None:
    ratings = [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]

    assert random_ndcg_at_k(ratings) < ndcg_at_k(ratings, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0])


def test_rater_agreement() -> None:
    ratings = {("C1", "J1"): 0, ("C2", "J1"): 3, ("C3", "J1"): 1}

    assert rater_agreement({"a": ratings, "b": dict(ratings)}) == pytest.approx(1.0)
    assert rater_agreement({"a": ratings}) is None


def test_default_scorer_is_the_baseline() -> None:
    assert load_scorer("ats_scoring:score") is score


def test_scorer_spec_must_name_a_function() -> None:
    with pytest.raises(SystemExit):
        load_scorer("ats_scoring")


def test_baseline_ranks_a_clear_case_correctly(tmp_path: Path) -> None:
    write_eval_set(tmp_path, GOOD_RATINGS)

    report = evaluate(score, tmp_path)

    assert report["pairs_scored"] == 3
    assert report["model_version"] == MODEL_VERSION
    assert report["metrics"]["spearman_all_pairs"] == pytest.approx(1.0)
    assert report["metrics"]["ndcg_at_10_mean_per_job"] == pytest.approx(1.0)
    assert report["metrics"]["rater_agreement_kappa"] is None


def test_results_are_saved_with_date_and_model_version(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write_eval_set(tmp_path, GOOD_RATINGS)

    assert main(["--eval-dir", str(tmp_path)]) == 0

    saved = list((tmp_path / "results").glob("*.json"))
    assert len(saved) == 1
    report = json.loads(saved[0].read_text(encoding="utf-8"))
    assert saved[0].name == f"{report['date']}_{MODEL_VERSION}.json"
    assert "Spearman" in capsys.readouterr().out


def test_unrated_rows_are_skipped(tmp_path: Path) -> None:
    write_eval_set(tmp_path, [*GOOD_RATINGS[:2], ("C3", "J1", "")])

    assert evaluate(score, tmp_path)["pairs_rated"] == 2


def test_rating_outside_the_scale_is_rejected(tmp_path: Path) -> None:
    write_eval_set(tmp_path, [*GOOD_RATINGS[:2], ("C3", "J1", 5)])

    with pytest.raises(SystemExit, match="rating must be"):
        evaluate(score, tmp_path)


def test_rating_for_an_unknown_candidate_is_rejected(tmp_path: Path) -> None:
    write_eval_set(tmp_path, [*GOOD_RATINGS, ("C9", "J1", 1)])

    with pytest.raises(SystemExit, match="C9/J1"):
        evaluate(score, tmp_path)


def test_missing_ratings_are_reported(tmp_path: Path) -> None:
    write_eval_set(tmp_path, [])

    with pytest.raises(SystemExit, match="No ratings"):
        evaluate(score, tmp_path)
