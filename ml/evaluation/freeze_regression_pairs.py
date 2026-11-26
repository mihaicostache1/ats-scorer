"""Freeze the scorer regression pairs (L-19): the inputs, the expected results and why they moved.

    python evaluation/freeze_regression_pairs.py --note "Why the expected values change"
    python evaluation/freeze_regression_pairs.py --check   # exit 1 if the frozen file is stale

The pairs below are scored and their total (as a range), band and matched skills are written to
tests/data/scorer_regression/, which tests/test_scorer_regression.py checks in CI. The file also
records a fingerprint of what should move the scores: weights.yaml (weights, skill weights,
bands, model version), the embedding model and the skill taxonomy (the scorer's aliases and the
parser's). Changing any of them fails the test until this script is run again in the same PR,
and the script refuses to run without a note saying why, which it adds to the file's history
together with a digest of the expected results it vouches for. Changing those results in any
other way (by hand, or by rerunning without a new note) fails the test too.

The inputs are frozen too. Candidates and jobs are copied from evaluation/data the first time a
pair is frozen and never again, so a change to the evaluation set does not move these tests.
Embedding vectors likewise: a frozen vector is kept as long as the embedding model and revision
stay the same, and only a new pair's vectors are copied. When the model changes they are all
copied again: rebuild evaluation/data/embeddings.json with embed_eval_set.py first.
"""

import argparse
import hashlib
import json
import sys
from collections.abc import Mapping, Sequence
from datetime import date
from importlib import resources
from pathlib import Path
from typing import Any

import yaml

from ats_scoring import score
from ats_scoring.config import DEFAULT_CONFIG
from ats_scoring.evaluate import DEFAULT_EVAL_DIR, EMBEDDINGS_FILE, load_embeddings
from ats_scoring.skill_normalizer import ALIASES as PARSER_ALIASES
from ats_scoring.skills import SKILL_ALIASES

OUT_DIR = Path(__file__).resolve().parents[1] / "tests" / "data" / "scorer_regression"
EXPECTED_FILE = "expected.json"
INPUTS_FILE = "inputs.json"
VECTORS_FILE = "embeddings.json"

# A total may move this many points either way from its frozen_total before the test fails. Below
# it is rounding or a refactor; a bigger move is a change in behaviour that a reviewer should see
# in the diff. The test reads it from here, not from the frozen file.
TOLERANCE = 2.0

# The parts of expected.json a history note vouches for (everything but the history itself).
RESULT_KEYS = ("model_version", "tolerance", "fingerprint", "pairs")

Pair = tuple[str, str, bool, str]

# (candidate id, job id, scored with embeddings, why this pair). Ten rated pairs over the six
# jobs of the evaluation set, every rating from 0 to 3, plus one pair without embeddings.
PAIRS: tuple[Pair, ...] = (
    ("C021", "J01", True, "rated 3; the 'strong' explanation example"),
    ("C031", "J01", True, "rated 2; the 'moderate' example: under the minimum, skills missing"),
    ("C009", "J01", True, "rated 0; the 'weak' example: a different role"),
    ("C021", "J01", False, "the strong pair without embeddings: weights spread over the rest"),
    ("C008", "J07", True, "rated 3"),
    ("C006", "J07", True, "rated 1"),
    ("C010", "J10", True, "rated 3"),
    ("C021", "J10", True, "rated 0; the candidate of the strong J01 pair, wrong job"),
    ("C034", "J04", True, "rated 2"),
    ("C039", "J09", True, "rated 3"),
    ("C077", "J13", True, "rated 1"),
)


def pair_id(candidate_id: str, job_id: str, embeddings: bool) -> str:
    return f"{candidate_id}-{job_id}" + ("" if embeddings else "-no-embeddings")


def _digest(value: Any) -> str:
    text = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def fingerprint() -> dict[str, str]:
    """What the expected values depend on besides the code (weights.yaml comments ignored)."""
    settings = yaml.safe_load(
        resources.files("ats_scoring").joinpath("weights.yaml").read_text(encoding="utf-8")
    )
    embedding = DEFAULT_CONFIG.embedding
    return {
        "weights_yaml": _digest(settings),
        "embedding_model": f"{embedding.model}@{embedding.revision}",
        "skill_taxonomy": _digest({"scorer": SKILL_ALIASES, "parser": PARSER_ALIASES}),
    }


def results_digest(expected: Mapping[str, Any]) -> str:
    """A digest of the expected results, kept in the history entry whose note explains them."""
    return _digest({key: expected[key] for key in RESULT_KEYS})


def allowed_range(frozen_total: float) -> tuple[float, float]:
    """The totals the test accepts for a pair frozen at frozen_total."""
    return (
        round(max(0.0, frozen_total - TOLERANCE), 2),
        round(min(100.0, frozen_total + TOLERANCE), 2),
    )


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def frozen_inputs(out_dir: Path) -> dict[str, dict[str, Any]]:
    """The frozen candidates and jobs, with any new pair's records copied from evaluation/data."""
    path = out_dir / INPUTS_FILE
    inputs = _read(path) if path.is_file() else {"candidates": {}, "jobs": {}}
    data = DEFAULT_EVAL_DIR / "data"
    for candidate_id, job_id, _, _ in PAIRS:
        for kind, record_id in (("candidates", candidate_id), ("jobs", job_id)):
            if record_id not in inputs[kind]:
                inputs[kind][record_id] = _read(data / kind / f"{record_id}.json")
    return inputs


def frozen_vectors(
    out_dir: Path,
    pairs: Sequence[Pair] = PAIRS,
    source_path: Path = DEFAULT_EVAL_DIR / EMBEDDINGS_FILE,
) -> dict[str, Any]:
    """The vectors of the pairs scored with embeddings.

    While the embedding model and revision stay the same, a vector already frozen is kept as it
    is and only missing ones are copied from evaluation/data, so adding a pair moves no other
    pair even if the evaluation set was re-embedded since. With a new model or revision, every
    vector is copied again.
    """
    settings = DEFAULT_CONFIG.embedding
    needed = {
        "candidates": {c for c, _, with_vectors, _ in pairs if with_vectors},
        "jobs": {j for _, j, with_vectors, _ in pairs if with_vectors},
    }
    kept: dict[str, Any] = {kind: {} for kind in needed}
    path = out_dir / VECTORS_FILE
    if path.is_file():
        old = _read(path)
        if (old["model"], old["revision"]) == (settings.model, settings.revision):
            kept = {kind: old[kind] for kind in needed}

    missing = {kind: sorted(ids - set(kept[kind])) for kind, ids in needed.items()}
    # Read (and check the model of) evaluation/data only when something has to be copied.
    source = load_embeddings(source_path) if any(missing.values()) else None
    vectors: dict[str, Any] = {"model": settings.model, "revision": settings.revision}
    for kind, ids in needed.items():
        copied: dict[str, Any] = {}
        if source is not None:
            absent = [record_id for record_id in missing[kind] if record_id not in source[kind]]
            if absent:
                raise SystemExit(f"{source_path} has no vector for {', '.join(absent)}")
            copied = {record_id: source[kind][record_id] for record_id in missing[kind]}
        merged = {**kept[kind], **copied}
        vectors[kind] = {record_id: merged[record_id] for record_id in sorted(ids)}
    return vectors


def score_pair(
    inputs: Mapping[str, Any],
    vectors: Mapping[str, Any],
    candidate_id: str,
    job_id: str,
    embeddings: bool,
) -> dict[str, Any]:
    """The scorer's result for one frozen pair, exactly as the test computes it."""
    return score(
        inputs["candidates"][candidate_id],
        inputs["jobs"][job_id],
        candidate_embedding=vectors["candidates"][candidate_id] if embeddings else None,
        job_embedding=vectors["jobs"][job_id] if embeddings else None,
    )


def expected_values(inputs: Mapping[str, Any], vectors: Mapping[str, Any]) -> list[dict[str, Any]]:
    pairs = []
    for candidate_id, job_id, embeddings, why in PAIRS:
        result = score_pair(inputs, vectors, candidate_id, job_id, embeddings)
        total = result["total"]
        total_min, total_max = allowed_range(total)
        pairs.append(
            {
                "id": pair_id(candidate_id, job_id, embeddings),
                "candidate_id": candidate_id,
                "job_id": job_id,
                "embeddings": embeddings,
                "why": why,
                "frozen_total": total,
                # For the reader of the diff; the test recomputes them from frozen_total.
                "total_min": total_min,
                "total_max": total_max,
                "band": result["explanation"]["band"],
                "matched_skills": result["matched_skills"],
            }
        )
    return pairs


def render(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def render_vectors(vectors: Mapping[str, Any]) -> str:
    """One line per vector, so the file stays readable and a diff shows which vector changed."""
    lines = ["{", f'  "model": {json.dumps(vectors["model"])},']
    lines.append(f'  "revision": {json.dumps(vectors["revision"])},')
    for index, kind in enumerate(("candidates", "jobs")):
        lines.append(f'  "{kind}": {{')
        items = sorted(vectors[kind].items())
        for position, (record_id, vector) in enumerate(items):
            comma = "," if position < len(items) - 1 else ""
            lines.append(f'    "{record_id}": {json.dumps(vector)}{comma}')
        lines.append("  }," if index == 0 else "  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def build(out_dir: Path, note: str | None) -> dict[str, str]:
    """The three files' new contents, by name. Without a note, the history is left as it is."""
    inputs = frozen_inputs(out_dir)
    vectors = frozen_vectors(out_dir)
    path = out_dir / EXPECTED_FILE
    history = _read(path)["history"] if path.is_file() else []
    current = fingerprint()
    expected: dict[str, Any] = {
        "model_version": DEFAULT_CONFIG.model_version,
        "tolerance": TOLERANCE,
        "fingerprint": current,
        "pairs": expected_values(inputs, vectors),
    }
    if note is not None:
        history.append(
            {
                "date": date.today().isoformat(),
                "model_version": DEFAULT_CONFIG.model_version,
                "fingerprint": current,
                "results": results_digest(expected),
                "note": note,
            }
        )
    expected["history"] = history
    return {
        EXPECTED_FILE: render(expected),
        INPUTS_FILE: render(inputs),
        VECTORS_FILE: render_vectors(vectors),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--note", help="why the expected values change; kept in the history")
    group.add_argument("--check", action="store_true", help="only compare, write nothing")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    if args.check:
        stale = []
        for name, text in build(args.out, None).items():
            path = args.out / name
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        if stale:
            print(f"out of date: {', '.join(stale)}. Run this script with --note.")
            return 1
        return 0

    note = args.note.strip()
    if len(note) < 15:
        raise SystemExit("--note must say why the expected values change (15 characters or more)")
    args.out.mkdir(parents=True, exist_ok=True)
    for name, text in build(args.out, note).items():
        (args.out / name).write_text(text, encoding="utf-8")
        print(f"wrote {args.out / name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
