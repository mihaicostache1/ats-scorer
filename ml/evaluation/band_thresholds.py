"""Pick the strong / moderate / weak thresholds on the L-9 pairs and check them on the rest (L-18).

    python evaluation/band_thresholds.py            # prints and saves it to results/
    python evaluation/band_thresholds.py --no-save  # prints only

Everything that decides the outcome is fixed below, before the search was run: which pairs the
thresholds are picked on and which they are checked on, which band each rating should get, the
thresholds tried, what is maximized, and when the result goes into weights.yaml.
Write-up: docs/ml/experiments.md.

The thresholds are picked on the 30 L-9 pairs, the carefully rated ones, and checked on the 30
pairs added in L-15, rated in a hurried session. The split is by job, like L-15's, so the check
also asks whether thresholds carry over to jobs they were not picked on. L-17 set provisional
thresholds (60 / 40) by reading a table of all 60 pairs, so this rerun on a fixed rule replaces
that choice; its check half is no longer unseen, and the write-up says so.
"""

import argparse
import json
import random
import statistics
from collections import Counter, defaultdict
from collections.abc import Iterator, Mapping, Sequence
from datetime import date
from typing import Any

from sklearn.metrics import cohen_kappa_score

from ats_scoring.config import DEFAULT_CONFIG, BandSettings
from ats_scoring.evaluate import (
    DEFAULT_EVAL_DIR,
    EMBEDDINGS_FILE,
    load_embeddings,
    load_ratings,
    load_records,
)
from ats_scoring.explanation import band
from ats_scoring.scoring import score

FIT_JOBS = ("J01", "J07", "J10")  # the L-9 pairs: Senior Backend Engineer, Data Analyst, Marketing
CHECK_JOBS = ("J04", "J09", "J13")  # the L-15 pairs: Lead Platform Engineer, UX Designer, Senior DS

BANDS = ("weak", "moderate", "strong")  # in order, for the ordinal agreement

# The band each rating should get, from the rating scale (docs/ml/evaluation.md):
# 3 "strong fit, you would shortlist", 2 "good fit, one gap an interview could clear up",
# 1 "weak fit" and 0 "no fit".
TARGET = {3: "strong", 2: "moderate", 1: "weak", 0: "weak"}

# Thresholds tried: multiples of 5 from 5 to 95, moderate below strong. 30 pairs cannot support a
# finer cut, and round numbers are easier to explain to recruiters.
STEP = 5

# What the search maximizes on the fit pairs: quadratic-weighted kappa between the band and the
# target band, so putting a "no fit" in strong costs more than putting it in moderate. Ties go to
# fewer two-band errors (a 3 in weak, or a 0 or 1 in strong), then to the middle of the tied
# thresholds (the lower median of tied strong thresholds, then of tied moderate ones), so the
# pick does not sit on the edge of a flat region.

# The thresholds go into weights.yaml only if the weighted kappa on the check pairs is at least
# MIN_CHECK_KAPPA ("moderate agreement" on the usual reading of kappa). Otherwise the bands stay
# out of the UI until there is better data, and the write-up says so.
MIN_CHECK_KAPPA = 0.40

BOOTSTRAP_SAMPLES = 5000

Row = dict[str, Any]


def candidate_thresholds(step: int = STEP) -> Iterator[BandSettings]:
    for strong in range(2 * step, 100, step):
        for moderate in range(step, strong, step):
            yield BandSettings(strong=float(strong), moderate=float(moderate))


def target(rating: float) -> str:
    """The target band of a (mean) rating, rounded to the nearest whole rating."""
    return TARGET[int(rating + 0.5)]


def kappa(rows: Sequence[Row], bands: BandSettings, total: str = "total") -> float:
    """Quadratic-weighted kappa between the bands and the target bands."""
    given = [BANDS.index(band(row[total], bands)) for row in rows]
    wanted = [BANDS.index(target(row["rating"])) for row in rows]
    if len(set(given) | set(wanted)) < 2:
        return 0.0
    return float(cohen_kappa_score(wanted, given, weights="quadratic", labels=[0, 1, 2]))


def two_band_errors(rows: Sequence[Row], bands: BandSettings, total: str = "total") -> int:
    return sum(
        abs(BANDS.index(band(row[total], bands)) - BANDS.index(target(row["rating"]))) == 2
        for row in rows
    )


def search(rows: Sequence[Row]) -> tuple[BandSettings, list[dict[str, Any]], int]:
    """The best thresholds on `rows`, the 10 best with their scores, and how many tied."""
    ranked = sorted(
        (
            (round(kappa(rows, bands), 9), -two_band_errors(rows, bands), bands)
            for bands in candidate_thresholds()
        ),
        key=lambda item: (item[0], item[1]),
        reverse=True,
    )
    best = ranked[0][:2]
    tied = [bands for k, errors, bands in ranked if (k, errors) == best]
    strong = statistics.median_low(sorted({bands.strong for bands in tied}))
    moderate = statistics.median_low(
        sorted({bands.moderate for bands in tied if bands.strong == strong})
    )
    top = [
        {"strong": b.strong, "moderate": b.moderate, "kappa": k, "two_band_errors": -e}
        for k, e, b in ranked[:10]
    ]
    return BandSettings(strong=strong, moderate=moderate), top, len(tied)


def table(rows: Sequence[Row], bands: BandSettings, total: str = "total") -> dict[str, Any]:
    """How many pairs of each rating fall in each band, and agreement figures."""
    counts: dict[str, Counter[int]] = {name: Counter() for name in reversed(BANDS)}
    for row in rows:
        counts[band(row[total], bands)][int(row["rating"] + 0.5)] += 1
    by_band = {}
    for name, ratings in counts.items():
        size = sum(ratings.values())
        hits = sum(n for rating, n in ratings.items() if TARGET[rating] == name)
        wanted = sum(target(row["rating"]) == name for row in rows)
        by_band[name] = {
            "pairs": size,
            "ratings": {str(rating): ratings.get(rating, 0) for rating in (3, 2, 1, 0)},
            # Of the pairs in this band, the share whose rating belongs there.
            "precision": hits / size if size else None,
            # Of the pairs whose rating belongs in this band, the share that got it.
            "recall": hits / wanted if wanted else None,
        }
    agree = sum(band(row[total], bands) == target(row["rating"]) for row in rows)
    return {
        "pairs": len(rows),
        "kappa": kappa(rows, bands, total),
        "exact_agreement": agree / len(rows),
        "two_band_errors": two_band_errors(rows, bands, total),
        "bands": by_band,
    }


def bootstrap_kappa(rows: Sequence[Row], bands: BandSettings, samples: int) -> list[float]:
    """Mean and 95% interval of the kappa, resampling candidates within each job."""
    rng = random.Random(0)
    by_job: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        by_job[row["job_id"]].append(row)
    values = sorted(
        kappa([rng.choice(job) for job in by_job.values() for _ in job], bands)
        for _ in range(samples)
    )
    return [
        statistics.fmean(values),
        values[int(0.025 * samples)],
        values[int(0.975 * samples) - 1],
    ]


def require_embedding(embeddings: Mapping[str, Any], kind: str, record_id: str) -> Any:
    """The stored embedding of a candidate or job. The thresholds are picked on the scorer as it
    runs in production, with embeddings, so a missing vector stops the run instead of quietly
    scoring that pair without one."""
    vector = embeddings[kind].get(record_id)
    if vector is None:
        noun = {"candidates": "candidate", "jobs": "job"}[kind]
        raise SystemExit(
            f"No embedding for {noun} {record_id} in {EMBEDDINGS_FILE}. "
            "Rebuild it with embed_eval_set.py."
        )
    return vector


def load_pairs(embeddings: Mapping[str, Any]) -> list[Row]:
    """Every rated pair with its mean rating and its total, with and without embeddings.

    `total` always uses both embeddings (see `require_embedding`); `total_without_embeddings`
    is the separate comparison run, scored with no embeddings on purpose.
    """
    jobs = load_records(DEFAULT_EVAL_DIR / "data" / "jobs")
    candidates = load_records(DEFAULT_EVAL_DIR / "data" / "candidates")
    collected: dict[tuple[str, str], list[int]] = defaultdict(list)
    for ratings in load_ratings(DEFAULT_EVAL_DIR / "ratings").values():
        for pair, value in ratings.items():
            collected[pair].append(value)
    rows = []
    for (candidate_id, job_id), values in sorted(collected.items()):
        candidate, job = candidates[candidate_id], jobs[job_id]
        with_embeddings = score(
            candidate,
            job,
            candidate_embedding=require_embedding(embeddings, "candidates", candidate_id),
            job_embedding=require_embedding(embeddings, "jobs", job_id),
        )
        without_embeddings = score(candidate, job, candidate_embedding=None, job_embedding=None)
        rows.append(
            {
                "candidate_id": candidate_id,
                "job_id": job_id,
                "rating": statistics.fmean(values),
                "total": with_embeddings["total"],
                "total_without_embeddings": without_embeddings["total"],
            }
        )
    return rows


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def _print_table(name: str, result: Mapping[str, Any]) -> None:
    print(
        f"{name}: {result['pairs']} pairs, weighted kappa {_fmt(result['kappa'])}, "
        f"exact agreement {result['exact_agreement']:.0%}, "
        f"two-band errors {result['two_band_errors']}"
    )
    print("| Band | Pairs | Rated 3 | 2 | 1 | 0 | Precision | Recall |")
    print("|---|---|---|---|---|---|---|---|")
    for label, entry in result["bands"].items():
        r = entry["ratings"]
        print(
            f"| {label} | {entry['pairs']} | {r['3']} | {r['2']} | {r['1']} | {r['0']} | "
            f"{_fmt(entry['precision'])} | {_fmt(entry['recall'])} |"
        )
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--no-save", action="store_true", help="print only")
    args = parser.parse_args()

    rows = load_pairs(load_embeddings(DEFAULT_EVAL_DIR / EMBEDDINGS_FILE))
    halves = {
        "fit": [row for row in rows if row["job_id"] in FIT_JOBS],
        "check": [row for row in rows if row["job_id"] in CHECK_JOBS],
        "all": [row for row in rows if row["job_id"] in FIT_JOBS + CHECK_JOBS],
    }
    for name in ("fit", "check"):
        if len(halves[name]) < 10:
            raise SystemExit(f"Too few rated pairs in the {name} jobs. Rate them first.")

    picked, top, tied = search(halves["fit"])
    checked = table(halves["check"], picked)
    holds = checked["kappa"] >= MIN_CHECK_KAPPA
    results = {half: table(part, picked) for half, part in halves.items()}
    per_job = {
        job: table([row for row in rows if row["job_id"] == job], picked)
        for job in FIT_JOBS + CHECK_JOBS
    }
    moved = [
        f"{row['candidate_id']}/{row['job_id']}"
        for row in halves["all"]
        if band(row["total"], picked) != band(row["total_without_embeddings"], picked)
    ]
    report = {
        "date": date.today().isoformat(),
        "model_version": DEFAULT_CONFIG.model_version,
        "fit_jobs": list(FIT_JOBS),
        "check_jobs": list(CHECK_JOBS),
        "picked": {"strong": picked.strong, "moderate": picked.moderate},
        "thresholds_tied_for_best": tied,
        "top_10_on_fit": top,
        "check_kappa_bootstrap_95": bootstrap_kappa(halves["check"], picked, BOOTSTRAP_SAMPLES),
        "min_check_kappa": MIN_CHECK_KAPPA,
        "holds": holds,
        "weights_yaml": {
            "strong": DEFAULT_CONFIG.bands.strong,
            "moderate": DEFAULT_CONFIG.bands.moderate,
        },
        "results": results,
        "per_job": per_job,
        "without_embeddings": {
            "all": table(halves["all"], picked, "total_without_embeddings"),
            "pairs_changing_band": moved,
        },
    }

    print(f"{len(rows)} rated pairs, {DEFAULT_CONFIG.model_version}.")
    print(
        f"Picked on {', '.join(FIT_JOBS)}: strong from {picked.strong:g}, moderate from "
        f"{picked.moderate:g} ({tied} threshold pairs tied for best)."
    )
    print("Top 10 on the fit pairs (strong, moderate, kappa, two-band errors):")
    for entry in top:
        print(
            f"  {entry['strong']:g} {entry['moderate']:g}  {_fmt(entry['kappa'])}  "
            f"{entry['two_band_errors']}"
        )
    print()
    for half in ("fit", "check", "all"):
        _print_table(half, results[half])
    low, high = report["check_kappa_bootstrap_95"][1:]
    print(f"Check kappa 95% bootstrap interval: {low:.3f} to {high:.3f}")
    print(f"Rule: check kappa >= {MIN_CHECK_KAPPA}: {'holds' if holds else 'fails'}.")
    print()
    print("Per job (weighted kappa, exact agreement, pairs per band strong/moderate/weak):")
    for job, result in per_job.items():
        sizes = "/".join(str(entry["pairs"]) for entry in result["bands"].values())
        print(f"  {job}  {_fmt(result['kappa'])}  {result['exact_agreement']:.0%}  {sizes}")
    print()
    _print_table("all, without embeddings", report["without_embeddings"]["all"])
    print(f"Pairs that change band without embeddings: {len(moved)} of {len(halves['all'])}")

    if not args.no_save:
        path = DEFAULT_EVAL_DIR / "results" / f"{date.today().isoformat()}_band-thresholds.json"
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Saved to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
