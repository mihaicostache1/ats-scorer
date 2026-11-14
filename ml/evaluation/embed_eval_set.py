"""Precompute the embeddings of the evaluation set into data/embeddings.json.

Run it again whenever data/ or the embedding model in weights.yaml changes. It needs the
`[embeddings]` extra and the downloaded model, and no network access:

    python -m ats_scoring.embeddings download --to models/multilingual-e5-small
    python evaluation/embed_eval_set.py --model-dir models/multilingual-e5-small

The file is committed, so `python -m ats_scoring.evaluate` runs without PyTorch.
"""

import argparse
import json
from pathlib import Path

from ats_scoring.embeddings import Embedder
from ats_scoring.evaluate import DEFAULT_EVAL_DIR, EMBEDDINGS_FILE, load_records

# Rounded so the file stays small and diffs stay readable. The cosine moves by about 1e-7.
DECIMALS = 7


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--model-dir", type=Path, help="downloaded model (or set the env var)")
    parser.add_argument("--eval-dir", type=Path, default=DEFAULT_EVAL_DIR)
    args = parser.parse_args()

    embedder = Embedder(args.model_dir)
    candidates = load_records(args.eval_dir / "data" / "candidates")
    jobs = load_records(args.eval_dir / "data" / "jobs")

    def rounded(ids: list[str], vectors: list[list[float] | None]) -> dict[str, list[float]]:
        return {
            key: [round(value, DECIMALS) for value in vector]
            for key, vector in zip(ids, vectors, strict=True)
            if vector is not None
        }

    output = {
        "model": embedder.settings.model,
        "revision": embedder.settings.revision,
        "candidates": rounded(list(candidates), embedder.embed_candidates(candidates.values())),
        "jobs": rounded(list(jobs), embedder.embed_jobs(jobs.values())),
    }
    path = args.eval_dir / EMBEDDINGS_FILE
    path.write_text(json.dumps(output) + "\n", encoding="utf-8", newline="\n")
    print(
        f"Wrote {len(output['candidates'])} CV and {len(output['jobs'])} job embeddings to {path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
