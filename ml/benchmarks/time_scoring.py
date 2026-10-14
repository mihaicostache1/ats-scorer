"""Time the scorer: many candidates against one job, as the backend worker will run it.

Uses the synthetic dataset, so generate it first (see ml/synthetic/README.md). The 100
synthetic CVs are reused in turn to reach the requested number of candidates.

    python benchmarks/time_scoring.py
    python benchmarks/time_scoring.py --candidates 1000 --job J01 --passes 3
"""

import argparse
import json
import platform
import statistics
import time
from pathlib import Path
from typing import Any

from ats_scoring import MODEL_VERSION, score

DATA_DIR = Path(__file__).resolve().parents[1] / "synthetic" / "output"


def load_candidates() -> list[dict[str, Any]]:
    candidates = []
    for path in sorted((DATA_DIR / "cvs").glob("C*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        # The generator keeps these fields next to parsed_data. The scorer expects them inside.
        candidates.append(
            {
                **record["parsed_data"],
                "headline": record["headline"],
                "summary": record["summary"],
                "certifications": record["certifications"],
            }
        )
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--candidates", type=int, default=1000, help="scoring calls per pass")
    parser.add_argument("--job", default="J01", help="job id from the synthetic dataset")
    parser.add_argument("--passes", type=int, default=3, help="timed passes, median reported")
    args = parser.parse_args()

    pool = load_candidates()
    if not pool:
        raise SystemExit(f"No synthetic CVs in {DATA_DIR / 'cvs'}. Run ml/synthetic/generate.py.")
    job = json.loads((DATA_DIR / "jobs" / f"{args.job}.json").read_text(encoding="utf-8"))
    batch = [pool[index % len(pool)] for index in range(args.candidates)]

    score(batch[0], job)  # warm-up: the first call loads scikit-learn
    timings = []
    for _ in range(max(1, args.passes)):
        started = time.perf_counter()
        for candidate in batch:
            score(candidate, job)
        timings.append(time.perf_counter() - started)

    seconds = statistics.median(timings)
    print(
        f"{MODEL_VERSION}: {args.candidates} candidates against job {args.job} in "
        f"{seconds:.2f} s, {seconds / args.candidates * 1000:.2f} ms each "
        f"(median of {len(timings)} passes)"
    )
    print(f"Python {platform.python_version()}, {platform.processor() or platform.machine()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
