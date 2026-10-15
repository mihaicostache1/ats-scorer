"""Evaluate a scorer against human ratings with Spearman correlation and NDCG@10.

    python -m ats_scoring.evaluate
    python -m ats_scoring.evaluate --scorer my_package.my_module:my_score

Reads the evaluation set in ml/evaluation (see docs/ml/evaluation.md), prints the metrics
and saves them to ml/evaluation/results/<date>_<model version>.json.
"""

import argparse
import csv
import importlib
import json
import math
import random
import re
import statistics
from collections import defaultdict
from collections.abc import Callable, Mapping
from datetime import date
from itertools import combinations
from pathlib import Path
from typing import Any

from scipy.stats import spearmanr
from sklearn.metrics import cohen_kappa_score, ndcg_score

from ats_scoring.scoring import NothingToScoreError

Scorer = Callable[[Mapping[str, Any], Mapping[str, Any]], Any]
Pair = tuple[str, str]  # (candidate_id, job_id)

DEFAULT_SCORER = "ats_scoring:score"
DEFAULT_EVAL_DIR = Path(__file__).resolve().parents[1] / "evaluation"
K = 10
RATINGS = {"0", "1", "2", "3"}


# --------------------------------------------------------------------------- metrics


def spearman(ratings: list[float], scores: list[float]) -> float | None:
    """Spearman rank correlation. None when undefined: under 3 pairs, or no variation."""
    if len(ratings) < 3 or len(set(ratings)) < 2 or len(set(scores)) < 2:
        return None
    rho, _p_value = spearmanr(ratings, scores)
    return None if math.isnan(rho) else float(rho)


def ndcg_at_k(ratings: list[float], scores: list[float], k: int = K) -> float | None:
    """NDCG@k of the order the scores put the candidates in, with the ratings as gains.

    None when undefined: a single candidate, or none rated above 0.
    """
    if len(ratings) < 2 or max(ratings) == 0:
        return None
    return float(ndcg_score([ratings], [scores], k=k))


def random_ndcg_at_k(ratings: list[float], k: int = K, shuffles: int = 1000) -> float | None:
    """Average NDCG@k of random orders: the level a scorer has to beat."""
    if len(ratings) < 2 or max(ratings) == 0:
        return None
    rng = random.Random(0)
    values = [
        float(ndcg_score([ratings], [[rng.random() for _ in ratings]], k=k))
        for _ in range(shuffles)
    ]
    return statistics.fmean(values)


def rater_agreement(raters: Mapping[str, Mapping[Pair, int]]) -> float | None:
    """Mean quadratic-weighted Cohen's kappa over each pair of raters, on pairs both rated.

    1 is perfect agreement, 0 is what chance would give. None with fewer than two raters.
    """
    kappas = []
    for first, second in combinations(sorted(raters), 2):
        shared = sorted(raters[first].keys() & raters[second].keys())
        first_ratings = [raters[first][pair] for pair in shared]
        second_ratings = [raters[second][pair] for pair in shared]
        if len(shared) < 2 or len(set(first_ratings) | set(second_ratings)) < 2:
            continue
        kappa = cohen_kappa_score(
            first_ratings, second_ratings, labels=[0, 1, 2, 3], weights="quadratic"
        )
        if not math.isnan(kappa):
            kappas.append(float(kappa))
    return statistics.fmean(kappas) if kappas else None


# --------------------------------------------------------------------------- loading


def load_scorer(spec: str) -> Scorer:
    """Import a scorer given as 'package.module:function'."""
    module_name, _, attribute = spec.partition(":")
    if not module_name or not attribute:
        raise SystemExit(f"--scorer must look like package.module:function, not {spec!r}")
    scorer = getattr(importlib.import_module(module_name), attribute, None)
    if not callable(scorer):
        raise SystemExit(f"{spec} is not a function")
    return scorer


def load_records(directory: Path) -> dict[str, dict[str, Any]]:
    """Read every JSON file in a folder, keyed by file name without extension."""
    return {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(directory.glob("*.json"))
    }


def load_ratings(directory: Path) -> dict[str, dict[Pair, int]]:
    """Read every ratings/<rater>.csv into {rater: {(candidate_id, job_id): rating}}."""
    raters: dict[str, dict[Pair, int]] = {}
    for path in sorted(directory.glob("*.csv")):
        ratings: dict[Pair, int] = {}
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            missing = {"candidate_id", "job_id", "rating"} - set(reader.fieldnames or [])
            if missing:
                raise SystemExit(f"{path.name} has no {', '.join(sorted(missing))} column")
            for line, row in enumerate(reader, start=2):
                value = (row["rating"] or "").strip()
                if not value:
                    continue
                if value not in RATINGS:
                    raise SystemExit(
                        f"{path.name} line {line}: rating must be 0, 1, 2 or 3, not {value!r}"
                    )
                ratings[(row["candidate_id"].strip(), row["job_id"].strip())] = int(value)
        if ratings:
            raters[path.stem] = ratings
    return raters


# --------------------------------------------------------------------------- evaluation


def _total(result: Any) -> float:
    """Read the 0-100 total from a score() result, or accept a bare number."""
    return float(result["total"] if isinstance(result, Mapping) else result)


def _mean(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return statistics.fmean(present) if present else None


def evaluate(
    scorer: Scorer, eval_dir: Path = DEFAULT_EVAL_DIR, scorer_spec: str = DEFAULT_SCORER
) -> dict[str, Any]:
    """Score every rated pair and compare the scores with the mean human rating."""
    jobs = load_records(eval_dir / "data" / "jobs")
    candidates = load_records(eval_dir / "data" / "candidates")
    raters = load_ratings(eval_dir / "ratings")
    if not raters:
        raise SystemExit(f"No ratings in {eval_dir / 'ratings'}. See docs/ml/evaluation.md.")

    collected: dict[Pair, list[int]] = defaultdict(list)
    for ratings in raters.values():
        for pair, value in ratings.items():
            collected[pair].append(value)
    unknown = [
        f"{candidate_id}/{job_id}"
        for candidate_id, job_id in sorted(collected)
        if candidate_id not in candidates or job_id not in jobs
    ]
    if unknown:
        raise SystemExit(f"Ratings name pairs that are not in {eval_dir / 'data'}: {unknown}")

    rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    model_version = scorer_spec
    for (candidate_id, job_id), values in sorted(collected.items()):
        try:
            result = scorer(candidates[candidate_id], jobs[job_id])
        except NothingToScoreError:
            skipped.append(f"{candidate_id}/{job_id}")
            continue
        if isinstance(result, Mapping) and isinstance(result.get("model_version"), str):
            model_version = result["model_version"]
        rows.append(
            {
                "candidate_id": candidate_id,
                "job_id": job_id,
                "rating": statistics.fmean(values),
                "score": _total(result),
            }
        )

    per_job: dict[str, dict[str, Any]] = {}
    for job_id in sorted({row["job_id"] for row in rows}):
        ratings = [row["rating"] for row in rows if row["job_id"] == job_id]
        scores = [row["score"] for row in rows if row["job_id"] == job_id]
        per_job[job_id] = {
            "pairs": len(ratings),
            "spearman": spearman(ratings, scores),
            "ndcg_at_10": ndcg_at_k(ratings, scores),
            "ndcg_at_10_random": random_ndcg_at_k(ratings),
        }

    return {
        "date": date.today().isoformat(),
        "model_version": model_version,
        "scorer": scorer_spec,
        "raters": sorted(raters),
        "pairs_rated": len(collected),
        "pairs_scored": len(rows),
        "pairs_skipped": skipped,
        "metrics": {
            "spearman_all_pairs": spearman(
                [row["rating"] for row in rows], [row["score"] for row in rows]
            ),
            "spearman_mean_per_job": _mean([job["spearman"] for job in per_job.values()]),
            "ndcg_at_10_mean_per_job": _mean([job["ndcg_at_10"] for job in per_job.values()]),
            "ndcg_at_10_random_order": _mean(
                [job["ndcg_at_10_random"] for job in per_job.values()]
            ),
            "rater_agreement_kappa": rater_agreement(raters),
        },
        "per_job": per_job,
        "pairs": rows,
    }


# --------------------------------------------------------------------------- output


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def format_report(report: Mapping[str, Any]) -> str:
    metrics = report["metrics"]
    lines = [
        f"Model {report['model_version']}, {report['date']}: {report['pairs_scored']} pairs, "
        f"{len(report['raters'])} rater(s)",
        "",
        f"  Spearman, all pairs          {_fmt(metrics['spearman_all_pairs'])}",
        f"  Spearman, mean per job       {_fmt(metrics['spearman_mean_per_job'])}",
        f"  NDCG@10, mean per job        {_fmt(metrics['ndcg_at_10_mean_per_job'])}",
        f"  NDCG@10 of a random order    {_fmt(metrics['ndcg_at_10_random_order'])}",
        f"  Rater agreement (kappa)      {_fmt(metrics['rater_agreement_kappa'])}",
        "",
    ]
    for job_id, job in report["per_job"].items():
        lines.append(
            f"  {job_id}: {job['pairs']} pairs, Spearman {_fmt(job['spearman'])}, "
            f"NDCG@10 {_fmt(job['ndcg_at_10'])} (random {_fmt(job['ndcg_at_10_random'])})"
        )
    if report["pairs_skipped"]:
        lines.append(f"  Not scored (nothing to score): {', '.join(report['pairs_skipped'])}")
    return "\n".join(lines)


def save(report: Mapping[str, Any], results_dir: Path) -> Path:
    """Write the report to <results_dir>/<date>_<model version>.json."""
    results_dir.mkdir(parents=True, exist_ok=True)
    version = re.sub(r"[^A-Za-z0-9._-]+", "-", report["model_version"]).strip("-")
    path = results_dir / f"{report['date']}_{version}.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ats_scoring.evaluate", description=__doc__.split("\n\n")[0]
    )
    parser.add_argument(
        "--scorer",
        default=DEFAULT_SCORER,
        help=f"scorer to evaluate, as package.module:function (default: {DEFAULT_SCORER})",
    )
    parser.add_argument(
        "--eval-dir",
        type=Path,
        default=DEFAULT_EVAL_DIR,
        help="folder with data/, ratings/ and results/ (default: ml/evaluation)",
    )
    parser.add_argument("--no-save", action="store_true", help="print the metrics only")
    args = parser.parse_args(argv)

    report = evaluate(load_scorer(args.scorer), args.eval_dir, args.scorer)
    print(format_report(report))
    if not args.no_save:
        print(f"\nSaved to {save(report, args.eval_dir / 'results')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
