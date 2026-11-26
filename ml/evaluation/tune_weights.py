"""Grid search over the hybrid scorer's weights on half the jobs, checked on the other half (L-15).

    python evaluation/tune_weights.py              # prints, saves results/<date>_weight-tuning.json
    python evaluation/tune_weights.py --no-save

Everything that decides the outcome is fixed below and was committed before the 30 new pairs
were rated: which jobs are tuned on and which are held out, the grid, what is maximized, and
when the tuned weights replace the ones in weights.yaml. Write-up: docs/ml/experiments.md.

The split is by job, not by pair: every metric is computed within a job, and a job split also
asks the question that matters, whether the weights carry over to jobs they were not tuned on.
Each half has a technical job, a data job and a non-engineering job.
"""

import argparse
import dataclasses
import json
import random
import statistics
from collections import defaultdict
from collections.abc import Iterator, Mapping, Sequence
from datetime import date
from typing import Any

from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG
from ats_scoring.evaluate import (
    DEFAULT_EVAL_DIR,
    EMBEDDINGS_FILE,
    load_embeddings,
    load_ratings,
    load_records,
    ndcg_at_k,
    spearman,
)
from ats_scoring.scoring import MODEL_VERSION, score

TUNE_JOBS = ("J01", "J07", "J09")  # Senior Backend Engineer, Data Analyst, UX Designer
HELD_OUT_JOBS = ("J04", "J10", "J13")  # Lead Platform Engineer, Marketing Assistant, Senior DS

# Every weighting in steps of 0.05 that adds up to 1, with each component at 0.05 or more:
# a component at 0 would also drop its line from the explanations recruiters read.
STEP = 0.05
MIN_WEIGHT = 0.05

# What the search maximizes on the tuning jobs: mean Spearman per job (rankings are used within a
# job). Ties go to the higher NDCG@10, then the higher all-pairs Spearman, then the weighting
# closest to weights.yaml, so the search moves away from the current weights only when it gains.

# The tuned weights replace weights.yaml only if, on the held-out jobs, they beat the current
# weights on mean Spearman per job by at least MIN_GAIN, and are no worse on NDCG@10 and on
# Spearman over all pairs.
MIN_GAIN = 0.01

BOOTSTRAP_SAMPLES = 5000

# The L-7 baseline (tfidf-skills-0.1.0): 0.6 skill overlap + 0.4 TF-IDF. The hybrid scorer with
# these weights gives the same totals, because skill_overlap and text_similarity are computed as
# in L-7, and a job without skills puts all the weight on TF-IDF in both.
BASELINE_WEIGHTS = {"skill_overlap": 0.6, "text_similarity": 0.4}

Weights = dict[str, float]
Row = dict[str, Any]


def full(weights: Mapping[str, float]) -> Weights:
    return {name: float(weights.get(name, 0.0)) for name in COMPONENTS}


def grid(step: float = STEP, minimum: float = MIN_WEIGHT) -> Iterator[Weights]:
    """Every weighting in steps of `step`, each at least `minimum`, adding up to 1."""
    units = round(1 / step)
    low = round(minimum / step)

    def split(left: int, parts: int) -> Iterator[tuple[int, ...]]:
        if parts == 1:
            yield (left,)
            return
        for first in range(low, left - low * (parts - 1) + 1):
            for rest in split(left - first, parts - 1):
                yield (first, *rest)

    for counts in split(units, len(COMPONENTS)):
        yield {
            name: round(count * step, 10) for name, count in zip(COMPONENTS, counts, strict=True)
        }


def load_pairs(embeddings: Mapping[str, Any]) -> list[Row]:
    """Every rated pair with its mean rating and its components under the current scorer."""
    jobs = load_records(DEFAULT_EVAL_DIR / "data" / "jobs")
    candidates = load_records(DEFAULT_EVAL_DIR / "data" / "candidates")
    collected: dict[tuple[str, str], list[int]] = defaultdict(list)
    for ratings in load_ratings(DEFAULT_EVAL_DIR / "ratings").values():
        for pair, value in ratings.items():
            collected[pair].append(value)

    rows = []
    for (candidate_id, job_id), values in sorted(collected.items()):
        candidate, job = candidates[candidate_id], jobs[job_id]
        result = score(
            candidate,
            job,
            candidate_embedding=embeddings["candidates"].get(candidate_id),
            job_embedding=embeddings["jobs"].get(job_id),
        )
        rows.append(
            {
                "candidate_id": candidate_id,
                "job_id": job_id,
                "rating": statistics.fmean(values),
                "components": result["components"],
                "inputs": (candidate, job),
            }
        )
    return rows


def fast_total(components: Mapping[str, float | None], weights: Mapping[str, float]) -> float:
    """The total score() gives, from its components: their weighted mean, skipping None."""
    present = [(weights[name], value) for name, value in components.items() if value is not None]
    share = sum(weight for weight, _ in present)
    return sum(weight * value for weight, value in present) / share


def exact_totals(
    rows: Sequence[Row], weights: Mapping[str, float], embeddings: Mapping[str, Any]
) -> list[float]:
    """Totals from score() itself, used for every number that is reported."""
    config = dataclasses.replace(DEFAULT_CONFIG, weights=full(weights))
    return [
        score(
            *row["inputs"],
            config=config,
            candidate_embedding=embeddings["candidates"].get(row["candidate_id"]),
            job_embedding=embeddings["jobs"].get(row["job_id"]),
        )["total"]
        for row in rows
    ]


def metrics(rows: Sequence[Row], scores: Sequence[float]) -> dict[str, Any]:
    by_job: dict[str, tuple[list[float], list[float]]] = defaultdict(lambda: ([], []))
    for row, value in zip(rows, scores, strict=True):
        by_job[row["job_id"]][0].append(row["rating"])
        by_job[row["job_id"]][1].append(value)
    per_job = {job: spearman(r, s) for job, (r, s) in sorted(by_job.items())}
    ndcg = [ndcg_at_k(r, s) for r, s in by_job.values()]
    return {
        "pairs": len(rows),
        "spearman_all_pairs": spearman([row["rating"] for row in rows], list(scores)),
        "spearman_mean_per_job": _mean(list(per_job.values())),
        "ndcg_at_10_mean_per_job": _mean(ndcg),
        "spearman_per_job": per_job,
    }


def _mean(values: Sequence[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return statistics.fmean(present) if present else None


def _key(value: float | None) -> float:
    return -2.0 if value is None else round(value, 9)


def search(rows: Sequence[Row]) -> tuple[Weights, list[dict[str, Any]]]:
    """The best weighting on `rows`, and the 10 best with their metrics."""
    current = full(DEFAULT_CONFIG.weights)
    ranked = []
    for weights in grid():
        found = metrics(rows, [fast_total(row["components"], weights) for row in rows])
        distance = sum(abs(weights[name] - current[name]) for name in COMPONENTS)
        key = (
            _key(found["spearman_mean_per_job"]),
            _key(found["ndcg_at_10_mean_per_job"]),
            _key(found["spearman_all_pairs"]),
            -round(distance, 9),
        )
        ranked.append((key, weights, found))
    ranked.sort(key=lambda item: item[0], reverse=True)
    best_key = ranked[0][0][:3]
    top = [
        {"weights": weights, **{k: found[k] for k in found if k != "spearman_per_job"}}
        for _, weights, found in ranked[:10]
    ]
    tied = sum(1 for key, _, _ in ranked if key[:3] == best_key)
    top[0]["weightings_tied_for_best"] = tied
    top[0]["weightings_searched"] = len(ranked)
    return ranked[0][1], top


def bootstrap_gain(
    rows: Sequence[Row], before: Sequence[float], after: Sequence[float], samples: int
) -> dict[str, list[float]]:
    """95% intervals of after minus before, resampling candidates within each job."""
    rng = random.Random(0)
    by_job: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        by_job[row["job_id"]].append(index)
    gains: dict[str, list[float]] = {"spearman_mean_per_job": [], "ndcg_at_10_mean_per_job": []}
    for _ in range(samples):
        picked = [rng.choice(indexes) for indexes in by_job.values() for _ in indexes]
        sample = [rows[i] for i in picked]
        first = metrics(sample, [before[i] for i in picked])
        second = metrics(sample, [after[i] for i in picked])
        for name, values in gains.items():
            if first[name] is not None and second[name] is not None:
                values.append(second[name] - first[name])
    result = {}
    for name, values in gains.items():
        values.sort()
        low, high = values[int(0.025 * len(values))], values[int(0.975 * len(values)) - 1]
        result[name] = [statistics.fmean(values), low, high]
    return result


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def _weights(weights: Mapping[str, float]) -> str:
    return " / ".join(f"{weights.get(name, 0.0):.2f}" for name in COMPONENTS)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--no-save", action="store_true", help="print only")
    args = parser.parse_args()

    embeddings = load_embeddings(DEFAULT_EVAL_DIR / EMBEDDINGS_FILE)
    rows = load_pairs(embeddings)
    halves = {
        "tune": [row for row in rows if row["job_id"] in TUNE_JOBS],
        "held_out": [row for row in rows if row["job_id"] in HELD_OUT_JOBS],
        "all": [row for row in rows if row["job_id"] in TUNE_JOBS + HELD_OUT_JOBS],
    }
    for name, jobs in (("tune", TUNE_JOBS), ("held_out", HELD_OUT_JOBS)):
        counts = {job: sum(row["job_id"] == job for row in halves[name]) for job in jobs}
        if any(count < 2 for count in counts.values()):
            raise SystemExit(f"Too few rated pairs in the {name} jobs: {counts}. Rate them first.")

    tuned, top = search(halves["tune"])
    weightings = {
        "baseline (L-7)": full(BASELINE_WEIGHTS),
        "hybrid (weights.yaml)": full(DEFAULT_CONFIG.weights),
        "tuned": tuned,
    }
    results: dict[str, dict[str, Any]] = {}
    totals: dict[str, dict[str, list[float]]] = {}
    for label, weights in weightings.items():
        totals[label] = {
            half: exact_totals(part, weights, embeddings) for half, part in halves.items()
        }
        results[label] = {
            "weights": weights,
            **{half: metrics(part, totals[label][half]) for half, part in halves.items()},
        }

    current, new = results["hybrid (weights.yaml)"]["held_out"], results["tuned"]["held_out"]
    gain = new["spearman_mean_per_job"] - current["spearman_mean_per_job"]
    holds = (
        tuned != full(DEFAULT_CONFIG.weights)
        and gain >= MIN_GAIN
        and new["ndcg_at_10_mean_per_job"] >= current["ndcg_at_10_mean_per_job"] - 1e-9
        and new["spearman_all_pairs"] >= current["spearman_all_pairs"] - 1e-9
    )
    interval = bootstrap_gain(
        halves["held_out"],
        totals["hybrid (weights.yaml)"]["held_out"],
        totals["tuned"]["held_out"],
        BOOTSTRAP_SAMPLES,
    )

    print(f"{len(rows)} rated pairs. Weights: {' / '.join(COMPONENTS)}")
    print(
        f"Searched {top[0]['weightings_searched']} weightings on {', '.join(TUNE_JOBS)}, "
        f"{top[0]['weightings_tied_for_best']} tied for best. "
        f"Held out: {', '.join(HELD_OUT_JOBS)}."
    )
    print()
    print("| Scorer | Weights | Half | Spearman all | Spearman per job | NDCG@10 |")
    print("|---|---|---|---|---|---|")
    for label, result in results.items():
        for half in ("tune", "held_out", "all"):
            m = result[half]
            print(
                f"| {label} | {_weights(result['weights'])} | {half} | "
                f"{_fmt(m['spearman_all_pairs'])} | {_fmt(m['spearman_mean_per_job'])} | "
                f"{_fmt(m['ndcg_at_10_mean_per_job'])} |"
            )
    print()
    print("Spearman per job:")
    for label, result in results.items():
        per_job = {**result["tune"]["spearman_per_job"], **result["held_out"]["spearman_per_job"]}
        print(f"  {label:22} " + "  ".join(f"{j} {_fmt(v)}" for j, v in sorted(per_job.items())))
    print()
    print("Top 10 on the tuning jobs (Spearman per job, NDCG@10, Spearman all):")
    for entry in top:
        print(
            f"  {_weights(entry['weights'])}  {_fmt(entry['spearman_mean_per_job'])}  "
            f"{_fmt(entry['ndcg_at_10_mean_per_job'])}  {_fmt(entry['spearman_all_pairs'])}"
        )
    print()
    for name, (mean, low, high) in interval.items():
        print(f"Held-out gain, tuned - hybrid, {name}: {mean:+.3f} (95% {low:+.3f} to {high:+.3f})")
    print(f"Held-out gain in Spearman per job: {gain:+.3f} (needs {MIN_GAIN:+.3f} or more)")
    print("Decision: " + ("ADOPT the tuned weights" if holds else "KEEP weights.yaml"))

    if not args.no_save:
        report = {
            "date": date.today().isoformat(),
            "model_version": MODEL_VERSION,
            "raters": sorted(load_ratings(DEFAULT_EVAL_DIR / "ratings")),
            "pairs_rated": len(rows),
            "tune_jobs": TUNE_JOBS,
            "held_out_jobs": HELD_OUT_JOBS,
            "grid": {"step": STEP, "min_weight": MIN_WEIGHT},
            "min_gain": MIN_GAIN,
            "results": results,
            "top_on_tuning_jobs": top,
            "held_out_gain_bootstrap": interval,
            "decision": "adopt" if holds else "keep",
        }
        path = DEFAULT_EVAL_DIR / "results" / f"{report['date']}_weight-tuning.json"
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"\nSaved to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
