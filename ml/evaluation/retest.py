"""Compare a rater's second rating of pairs with their first: how consistent is one rater?

    python evaluation/retest.py retest/mihai_2026-11-17.csv     # against ratings/mihai.csv
    python evaluation/retest.py retest/mihai_2026-11-17.csv --rater mihai

The file in retest/ is a later rating of pairs already in ratings/<rater>.csv, by the same
person, without looking at the first. Only pairs rated in both files are compared. Files in
retest/ are never used by the evaluation or by tune_weights.py: ratings/<rater>.csv stays the
record. Uses the same kappa and Spearman as the harness (ats_scoring.evaluate).
"""

import argparse
from collections import defaultdict
from pathlib import Path

from ats_scoring.evaluate import DEFAULT_EVAL_DIR, load_ratings, rater_agreement, spearman


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("retest", type=Path, help="CSV with the second rating")
    parser.add_argument("--rater", help="rater name (default: the file name up to the first _)")
    args = parser.parse_args()

    path = args.retest if args.retest.is_absolute() else Path.cwd() / args.retest
    if not path.is_file():
        path = DEFAULT_EVAL_DIR / args.retest
    rater = args.rater or path.stem.split("_")[0]
    first = load_ratings(DEFAULT_EVAL_DIR / "ratings").get(rater)
    if first is None:
        raise SystemExit(f"No ratings/{rater}.csv with ratings")
    second = load_ratings(path.parent).get(path.stem, {})

    shared = sorted(first.keys() & second.keys(), key=lambda pair: (pair[1], pair[0]))
    if len(shared) < 3:
        raise SystemExit(f"Only {len(shared)} pairs rated in both files")
    before = [float(first[pair]) for pair in shared]
    after = [float(second[pair]) for pair in shared]
    by_job: dict[str, tuple[list[float], list[float]]] = defaultdict(lambda: ([], []))
    for pair, rating_before, rating_after in zip(shared, before, after, strict=True):
        by_job[pair[1]][0].append(rating_before)
        by_job[pair[1]][1].append(rating_after)
    differ = [(pair, first[pair], second[pair]) for pair in shared if first[pair] != second[pair]]

    print(f"ratings/{rater}.csv vs {path.name}: {len(shared)} pairs rated in both")
    print(f"  Same rating:         {len(shared) - len(differ)} of {len(shared)}")
    within = sum(1 for _, old, new in differ if abs(old - new) == 1)
    print(f"  Within one point:    {len(shared) - len(differ) + within} of {len(shared)}")
    kappa = rater_agreement({"first": {p: first[p] for p in shared}, "second": second})
    print(f"  Weighted kappa:      {_fmt(kappa)}  (quadratic, as for two raters)")
    print(f"  Spearman, all pairs: {_fmt(spearman(before, after))}")
    for job, (job_before, job_after) in sorted(by_job.items()):
        print(f"  Spearman, {job}:       {_fmt(spearman(job_before, job_after))}")
    mean_before, mean_after = sum(before) / len(before), sum(after) / len(after)
    print(f"  Mean rating:         {mean_before:.2f} -> {mean_after:.2f}")
    if differ:
        print("\nRated differently (first -> second):")
        for (candidate_id, job_id), old, new in differ:
            print(f"  {candidate_id} / {job_id}: {old} -> {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
