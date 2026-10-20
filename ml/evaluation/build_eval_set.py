"""Copy the jobs and CVs named in pairs.csv from the synthetic dataset into ml/evaluation.

Run once, after generating the synthetic dataset with its default seed (42). Writes:

- data/jobs/<job_id>.json: the job fields the scorer receives
- data/candidates/<candidate_id>.json: the parsed CV, without name or contact details
- pdfs/<candidate_id>.pdf: the CV the raters read
- jobs.md: the job descriptions the raters read

    python evaluation/build_eval_set.py
"""

import csv
import json
import shutil
from pathlib import Path
from typing import Any

from ats_scoring.schema import LEGACY_SCHEMA_VERSION

HERE = Path(__file__).resolve().parent
SYNTHETIC = HERE.parent / "synthetic" / "output"

JOB_FIELDS = (
    "title",
    "department",
    "location",
    "employment_type",
    "description",
    "required_skills",
    "preferred_skills",
    "min_experience_years",
)


def parsed_cv(record: dict[str, Any]) -> dict[str, Any]:
    """Turn a generator record into a parsed CV, as the backend stores it."""
    data = record["parsed_data"]
    return {
        "schema_version": LEGACY_SCHEMA_VERSION,
        "headline": record["headline"],
        "summary": record["summary"],
        "skills": data["skills"],
        "experience_years": data["experience_years"],
        "work_history": data["work_history"],
        "education": data["education"],
        "languages": record["languages"],
        "certifications": record["certifications"],
    }


def job_markdown(job_id: str, job: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"## {job_id}: {job['title']}",
            "",
            f"- Location: {job['location']}",
            f"- Employment type: {job['employment_type']}",
            f"- Minimum experience: {job['min_experience_years']} years",
            f"- Required skills: {', '.join(job['required_skills'])}",
            f"- Preferred skills: {', '.join(job['preferred_skills'])}",
            "",
            "```text",
            job["description"],
            "```",
            "",
        ]
    )


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SystemExit(f"Missing {path}. Generate the synthetic dataset first.")
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> int:
    with (HERE / "pairs.csv").open(encoding="utf-8", newline="") as handle:
        pairs = [(row["candidate_id"], row["job_id"]) for row in csv.DictReader(handle)]
    candidate_ids = sorted({candidate_id for candidate_id, _ in pairs})
    job_ids = sorted({job_id for _, job_id in pairs})

    sections = ["# Jobs to rate against", ""]
    for job_id in job_ids:
        job = read_json(SYNTHETIC / "jobs" / f"{job_id}.json")
        write_json(HERE / "data" / "jobs" / f"{job_id}.json", {k: job[k] for k in JOB_FIELDS})
        sections.append(job_markdown(job_id, job))
    (HERE / "jobs.md").write_text("\n".join(sections), encoding="utf-8", newline="\n")

    (HERE / "pdfs").mkdir(exist_ok=True)
    for candidate_id in candidate_ids:
        record = read_json(SYNTHETIC / "cvs" / f"{candidate_id}.json")
        write_json(HERE / "data" / "candidates" / f"{candidate_id}.json", parsed_cv(record))
        shutil.copyfile(SYNTHETIC / "cvs" / record["pdf_file"], HERE / "pdfs" / record["pdf_file"])

    print(f"Wrote {len(job_ids)} jobs and {len(candidate_ids)} CVs for {len(pairs)} pairs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
