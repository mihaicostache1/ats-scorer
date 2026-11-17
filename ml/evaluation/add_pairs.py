"""Add the L-15 pairs to pairs.csv: 30 more candidate/job pairs, for 3 more jobs.

The candidates are picked from the generator's metadata (role family and seniority) only, the
same way as the first 30 pairs (docs/ml/evaluation.md), so no score has any say in which pairs
are in the set. Run it once, after generating the synthetic dataset with its default seed (42),
then rebuild data/, pdfs/ and jobs.md:

    python evaluation/add_pairs.py
    python evaluation/build_eval_set.py

For each new job, the 10 candidates are:

- 5 from the job's own role family: one junior, one mid, one senior, one lead, and one more;
- 3 from neighbouring families, one from each;
- 2 from unrelated families, one from each.
"""

import csv
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SYNTHETIC = HERE.parent / "synthetic" / "output"
SEED = "42:L-15"
SENIORITIES = ("junior", "mid", "senior", "lead")

# job id: (role family, neighbouring families, unrelated families). Chosen by hand, as for the
# first three jobs: a lead technical job, a mid design job and a senior data job, so the set now
# covers every seniority and minimum experience from 0 to 9 years.
NEW_JOBS: dict[str, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    "J04": ("devops", ("backend", "qa", "frontend"), ("marketing", "ux_design")),
    "J09": ("ux_design", ("frontend", "product", "marketing"), ("devops", "qa")),
    "J13": ("data_science", ("data_analyst", "backend", "product"), ("mobile", "marketing")),
}


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SystemExit(f"Missing {path}. Generate the synthetic dataset first.")
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


def pick(job_id: str, by_family: dict[str, list[dict[str, Any]]]) -> list[str]:
    family, neighbours, unrelated = NEW_JOBS[job_id]
    rng = random.Random(f"{SEED}:{job_id}")
    own = by_family[family]
    chosen = [rng.choice([cv for cv in own if cv["seniority"] == level]) for level in SENIORITIES]
    chosen.append(rng.choice([cv for cv in own if cv not in chosen]))
    chosen += [rng.choice(by_family[other]) for other in (*neighbours, *unrelated)]
    return sorted(cv["candidate_id"] for cv in chosen)


def main() -> int:
    pairs_file = HERE / "pairs.csv"
    with pairs_file.open(encoding="utf-8", newline="") as handle:
        existing = [(row["candidate_id"], row["job_id"]) for row in csv.DictReader(handle)]
    already = sorted({job_id for _, job_id in existing} & NEW_JOBS.keys())
    if already:
        raise SystemExit(f"pairs.csv already has pairs for {', '.join(already)}. Nothing to do.")

    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path in sorted((SYNTHETIC / "cvs").glob("C*.json")):
        cv = read_json(path)
        by_family[cv["role_family"]].append(cv)
    if not by_family:
        raise SystemExit(f"No CVs in {SYNTHETIC / 'cvs'}. Generate the synthetic dataset first.")

    new_rows: list[tuple[str, str]] = []
    for job_id, (family, _, _) in NEW_JOBS.items():
        job = read_json(SYNTHETIC / "jobs" / f"{job_id}.json")
        if job["role_family"] != family:
            raise SystemExit(
                f"{job_id} is a {job['role_family']} job, not {family}: wrong dataset?"
            )
        new_rows += [(candidate_id, job_id) for candidate_id in pick(job_id, by_family)]

    with pairs_file.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerows((candidate_id, job_id, "") for candidate_id, job_id in new_rows)

    for job_id in NEW_JOBS:
        ids = [candidate_id for candidate_id, job in new_rows if job == job_id]
        print(f"{job_id}: {', '.join(ids)}")
    print(f"Added {len(new_rows)} pairs; pairs.csv now has {len(existing) + len(new_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
