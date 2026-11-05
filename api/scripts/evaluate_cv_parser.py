"""Measure B-13 against L-5 synthetic PDFs, never against ground-truth text.

From api/: python -m scripts.evaluate_cv_parser --dataset /tmp/synthetic --output report.json
Generate that dataset with ml/synthetic/generate.py. Targets remain proposed until
the lead agrees; --enforce-targets makes a miss return a nonzero exit status.
"""

import argparse
import hashlib
import importlib.metadata
import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

from ats_scoring.skills import clean_skill

from app.services.cv_parser import PARSER_VERSION, get_cv_parser, needs_review
from app.services.pdf_text import extract_text

PROPOSED_TARGETS = {"email_accuracy": 0.98, "phone_accuracy": 0.98, "skills_micro_f1": 0.90}


def skill_metrics(tp: int, fp: int, fn: int) -> dict[str, float | int]:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "micro_f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0,
    }


def evaluate(dataset: Path) -> dict[str, Any]:
    files = sorted((dataset / "cvs").glob("*.json"))
    if not files:
        raise ValueError(f"No synthetic ground-truth records in {dataset / 'cvs'}")
    parser = get_cv_parser()
    totals: dict[str, Counter[str]] = {}
    failures = []
    fingerprint = hashlib.sha256()
    for path in files:
        truth = json.loads(path.read_text(encoding="utf-8"))
        if truth.get("synthetic") is not True:
            raise ValueError(f"Expected synthetic data: {path.name}")
        pdf_bytes = path.with_suffix(".pdf").read_bytes()
        fingerprint.update(path.name.encode() + path.read_bytes() + pdf_bytes)
        # Only the PDF goes into the parser. Truth is read solely for evaluation.
        parsed = parser.parse(extract_text(pdf_bytes).text)
        expected = {clean_skill(skill) for skill in truth["parsed_data"]["skills"]}
        found = {clean_skill(skill.raw) for skill in parsed.skills}
        email_ok = (parsed.contact.email or "").casefold() == truth["email"].casefold()
        phone_ok = re.sub(r"\D", "", parsed.contact.phone or "") == re.sub(
            r"\D", "", truth["phone"]
        )
        for group in ("overall", truth["layout"]):
            counter = totals.setdefault(group, Counter())
            counter.update(
                {
                    "documents": 1,
                    "email_correct": int(email_ok),
                    "phone_correct": int(phone_ok),
                    "tp": len(expected & found),
                    "fp": len(found - expected),
                    "fn": len(expected - found),
                    "needs_review": int(needs_review(parsed)),
                }
            )
        if not email_ok or not phone_ok or expected != found:
            failures.append(
                {
                    "candidate_id": truth["candidate_id"],
                    "layout": truth["layout"],
                    "email_correct": email_ok,
                    "phone_correct": phone_ok,
                    "missing_skills": sorted(expected - found),
                    "extra_skills": sorted(found - expected),
                }
            )
    metrics = {
        group: {
            "documents": c["documents"],
            "email_correct": c["email_correct"],
            "email_accuracy": c["email_correct"] / c["documents"],
            "phone_correct": c["phone_correct"],
            "phone_accuracy": c["phone_correct"] / c["documents"],
            "skills": skill_metrics(c["tp"], c["fp"], c["fn"]),
            "needs_review": c["needs_review"],
        }
        for group, c in totals.items()
    }
    overall = metrics["overall"]
    return {
        "parser_version": PARSER_VERSION,
        "packages": {
            name: importlib.metadata.version(name)
            for name in (
                "spacy",
                "en-core-web-sm",
                "pymupdf",
                "ats-scoring",
                "Faker",
                "reportlab",
            )
        },
        "dataset_sha256": fingerprint.hexdigest(),
        "generator": {
            key: value
            for key, value in json.loads(
                (dataset / "manifest.json").read_text(encoding="utf-8")
            ).items()
            if key in {"generator_version", "seed", "reference_year", "counts", "packages"}
        },
        "normalizer": "ESCO_SKILLS_CSV"
        if os.environ.get("ESCO_SKILLS_CSV")
        else "L-11 aliases only",
        "target_status": "proposed; pending lead agreement",
        "proposed_targets": PROPOSED_TARGETS,
        "meets_proposed_targets": (
            overall["email_accuracy"] >= PROPOSED_TARGETS["email_accuracy"]
            and overall["phone_accuracy"] >= PROPOSED_TARGETS["phone_accuracy"]
            and overall["skills"]["micro_f1"] >= PROPOSED_TARGETS["skills_micro_f1"]
        ),
        "metrics": metrics,
        "failures": failures,
    }


def main() -> int:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--dataset", type=Path, required=True)
    cli.add_argument("--output", type=Path, required=True)
    cli.add_argument("--enforce-targets", action="store_true")
    args = cli.parse_args()
    report = evaluate(args.dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(report["metrics"], indent=2))
    return int(args.enforce_targets and not report["meets_proposed_targets"])


if __name__ == "__main__":
    raise SystemExit(main())
