"""Write the example score explanations the frontend can mock (L-17, F-15).

Each example is the `explanation` the scorer returns for a fixed CV and job: three pairs of the
evaluation set with their stored embeddings (strong, moderate, weak), and the schema 1.0
fixture `full.json` against two hand-written jobs, scored without embeddings. Run it again
whenever the scorer, weights.yaml or the templates change; the tests fail until you do.

    python evaluation/explanation_examples.py            # rewrite the examples
    python evaluation/explanation_examples.py --check    # exit 1 if any is out of date
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from ats_scoring import score
from ats_scoring.evaluate import DEFAULT_EVAL_DIR, EMBEDDINGS_FILE
from ats_scoring.schema import load_parsed_cv_fixture

OUT_DIR = Path(__file__).resolve().parents[1] / "ats_scoring/schemas/examples/score_explanation"

# Name -> (candidate id, job id) of the evaluation set, scored with the stored embeddings.
EVALUATION_PAIRS = {
    "strong": ("C021", "J01"),  # rated 3 (strong fit)
    "moderate": ("C031", "J01"),  # rated 2: below the minimum experience, 4 required skills missing
    "weak": ("C009", "J01"),  # rated 0: a different role, meets the experience
}

# A job as the API stores it. The CV writes "Postgres" and "k8s" for two of its skills.
BACKEND_JOB = {
    "title": "Backend Developer",
    "description": "Build and run REST services in Python on PostgreSQL and Kubernetes.",
    "required_skills": ["Python", "PostgreSQL", "Kubernetes", "Docker"],
    "preferred_skills": ["FastAPI", "Redis"],
    "min_experience_years": 3,
}
# A job with no skill list and no minimum experience: those parts are not scored.
OPEN_JOB = {
    "title": "Software Engineer",
    "description": "Join a small team building web services for logistics customers.",
    "required_skills": [],
    "preferred_skills": [],
    "min_experience_years": None,
}


def _read(path: Path) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


def build_examples(eval_dir: Path = DEFAULT_EVAL_DIR) -> dict[str, dict[str, Any]]:
    """The example explanations, by name."""
    data = eval_dir / "data"
    embeddings = _read(eval_dir / EMBEDDINGS_FILE)
    examples = {}
    for name, (candidate_id, job_id) in EVALUATION_PAIRS.items():
        result = score(
            _read(data / "candidates" / f"{candidate_id}.json"),
            _read(data / "jobs" / f"{job_id}.json"),
            candidate_embedding=embeddings["candidates"][candidate_id],
            job_embedding=embeddings["jobs"][job_id],
        )
        examples[name] = result["explanation"]

    cv = load_parsed_cv_fixture("valid", "full")
    examples["no_embedding_cv_phrases"] = score(cv, BACKEND_JOB)["explanation"]
    examples["job_without_skills_or_minimum"] = score(cv, OPEN_JOB)["explanation"]
    return examples


def render(explanation: dict[str, Any]) -> str:
    return json.dumps(explanation, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    parser.add_argument("--check", action="store_true", help="only compare, write nothing")
    args = parser.parse_args()

    examples = build_examples()
    stale = []
    for name, explanation in examples.items():
        path = args.out / f"{name}.json"
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != render(explanation):
                stale.append(name)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(render(explanation), encoding="utf-8")
            print(f"wrote {path}")
    if stale:
        print(f"out of date: {', '.join(stale)}. Run python evaluation/explanation_examples.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
