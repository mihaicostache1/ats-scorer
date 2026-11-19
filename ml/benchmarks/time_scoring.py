"""Time ranking many candidates against one job, as the backend worker will run it.

Uses the synthetic dataset, so generate it first (see ml/synthetic/README.md); pass
`--data` to point at another output folder, for example one made with `--cvs 1000`. If
there are fewer CVs than `--candidates`, they are reused in turn.

    python benchmarks/time_scoring.py
    python benchmarks/time_scoring.py --candidates 1000 --job J01 --passes 3
    python benchmarks/time_scoring.py --model-dir models/multilingual-e5-small

With `--model-dir`, it also embeds the CVs and the job (timed separately, as that happens
once per CV when it is parsed) and ranks with the embeddings. Network access is blocked
while anything is timed, to show that neither step uses it.
"""

import argparse
import json
import platform
import socket
import statistics
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from ats_scoring import MODEL_VERSION, NothingToScoreError, score

DEFAULT_DATA = Path(__file__).resolve().parents[1] / "synthetic" / "output"


def load_candidates(data_dir: Path) -> list[dict[str, Any]]:
    candidates = []
    for path in sorted((data_dir / "cvs").glob("C*.json")):
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


@contextmanager
def no_network() -> Iterator[None]:
    """Make every attempt to open a network connection raise."""

    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("network access attempted during a timed run")

    original = socket.socket.connect, socket.create_connection
    socket.socket.connect = refuse  # type: ignore[method-assign,assignment]
    socket.create_connection = refuse  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.socket.connect, socket.create_connection = original  # type: ignore[method-assign]


def rank(
    batch: list[dict[str, Any]],
    job: dict[str, Any],
    vectors: list[Any] | None,
    job_vector: Any,
) -> list[tuple[float, int]]:
    """Score every candidate and sort, best first. Unscorable candidates are left out."""
    ranked = []
    for index, candidate in enumerate(batch):
        try:
            result = score(
                candidate,
                job,
                candidate_embedding=None if vectors is None else vectors[index],
                job_embedding=job_vector,
            )
        except NothingToScoreError:
            continue
        ranked.append((result["total"], index))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked


def timed(passes: int, run: Callable[[], object]) -> float:
    timings = []
    for _ in range(max(1, passes)):
        started = time.perf_counter()
        run()
        timings.append(time.perf_counter() - started)
    return statistics.median(timings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--candidates", type=int, default=1000, help="candidates to rank")
    parser.add_argument("--job", default="J01", help="job id from the synthetic dataset")
    parser.add_argument("--passes", type=int, default=3, help="timed passes, median reported")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="synthetic output folder")
    parser.add_argument("--model-dir", type=Path, help="downloaded embedding model folder")
    args = parser.parse_args()

    pool = load_candidates(args.data)
    if not pool:
        raise SystemExit(f"No synthetic CVs in {args.data / 'cvs'}. Run ml/synthetic/generate.py.")
    job = json.loads((args.data / "jobs" / f"{args.job}.json").read_text(encoding="utf-8"))
    batch = [pool[index % len(pool)] for index in range(args.candidates)]
    distinct = min(len(pool), args.candidates)
    print(f"{MODEL_VERSION}: {args.candidates} candidates ({distinct} distinct) against {args.job}")

    rank(batch[:1], job, None, None)  # warm-up: the first call loads scikit-learn
    with no_network():
        seconds = timed(args.passes, lambda: rank(batch, job, None, None))
    print(
        f"  rank without embeddings  {seconds:7.2f} s  ({seconds / len(batch) * 1000:.2f} ms each)"
    )

    if args.model_dir:
        from ats_scoring.embeddings import Embedder

        with no_network():
            started = time.perf_counter()
            embedder = Embedder(args.model_dir)
            load_seconds = time.perf_counter() - started
            embedder.embed_candidates(batch[:8])  # warm-up
            started = time.perf_counter()
            vectors = embedder.embed_candidates(batch)
            job_vector = embedder.embed_job(job)
            embed_seconds = time.perf_counter() - started
            seconds = timed(args.passes, lambda: rank(batch, job, vectors, job_vector))
        print(f"  load model               {load_seconds:7.2f} s  (once per worker)")
        print(
            f"  embed CVs and the job    {embed_seconds:7.2f} s  "
            f"({embed_seconds / len(batch) * 1000:.1f} ms per CV, once per CV)"
        )
        each = seconds / len(batch) * 1000
        print(f"  rank with embeddings     {seconds:7.2f} s  ({each:.2f} ms each)")

    print(f"  median of {max(1, args.passes)} passes for the ranking rows")
    print(f"Python {platform.python_version()}, {platform.platform()}, {platform.processor()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
