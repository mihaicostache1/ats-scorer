"""Merge a ratings CSV (for example an export of the labeling tool) into ratings/<rater>.csv.

    python evaluation/merge_ratings.py ~/Downloads/mihai.csv            # into ratings/mihai.csv
    python evaluation/merge_ratings.py ~/Downloads/mihai.csv --rater mihai

For adding pairs to a set someone has already rated: the labeling tool exports every pair of
pairs.csv, empty where it was not rated, so rating only the new pairs gives a file with the old
ones empty. The result is a copy of pairs.csv, in its order, holding the ratings of both files.
A pair rated differently in the two files is an error, and nothing is written.
"""

import argparse
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
RATINGS = {"0", "1", "2", "3"}

Pair = tuple[str, str]


def read(path: Path) -> dict[Pair, str]:
    """{(candidate_id, job_id): rating} for the rated rows of a ratings CSV."""
    ratings: dict[Pair, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for line, row in enumerate(csv.DictReader(handle), start=2):
            value = (row.get("rating") or "").strip()
            if not value:
                continue
            if value not in RATINGS:
                raise SystemExit(f"{path} line {line}: rating must be 0, 1, 2 or 3, not {value!r}")
            ratings[(row["candidate_id"].strip(), row["job_id"].strip())] = value
    return ratings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("source", type=Path, help="CSV with the new ratings")
    parser.add_argument("--rater", help="rater name (default: the source file name)")
    args = parser.parse_args()

    rater = args.rater or args.source.stem
    target = HERE / "ratings" / f"{rater}.csv"
    with (HERE / "pairs.csv").open(encoding="utf-8", newline="") as handle:
        pairs = [(row["candidate_id"], row["job_id"]) for row in csv.DictReader(handle)]

    old = read(target) if target.is_file() else {}
    new = read(args.source)
    unknown = sorted(set(old) - set(pairs) | set(new) - set(pairs))
    if unknown:
        raise SystemExit(f"Not in pairs.csv: {', '.join(f'{c}/{j}' for c, j in unknown)}")
    conflicts = sorted(pair for pair in old.keys() & new.keys() if old[pair] != new[pair])
    if conflicts:
        listed = ", ".join(f"{c}/{j} ({old[(c, j)]} vs {new[(c, j)]})" for c, j in conflicts)
        raise SystemExit(f"Rated differently in {target.name} and {args.source.name}: {listed}")

    merged = {**old, **new}
    with target.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("candidate_id", "job_id", "rating"))
        writer.writerows((c, j, merged.get((c, j), "")) for c, j in pairs)

    added = len(merged) - len(old)
    print(f"{target}: {len(merged)} of {len(pairs)} pairs rated ({added} added)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
