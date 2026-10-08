"""Shared pieces for the L-6 embedding spike: model list, test data and encoding helpers."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from faker import Faker
from sentence_transformers import SentenceTransformer

# The synthetic dataset generator (L-5) lives in a sibling folder that is not a package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "synthetic"))
import generate  # noqa: E402

Record = dict[str, Any]
RESULTS_DIR = Path(__file__).resolve().parent / "results"


@dataclass(frozen=True)
class ModelSpec:
    key: str
    name: str
    # E5 models are trained with these prefixes and lose quality without them.
    query_prefix: str = ""
    doc_prefix: str = ""
    # Starting point for accepting a skill match by cosine similarity. Similarity
    # scales differ between models, so this has to be tuned per model.
    match_threshold: float = 0.70


MODELS = {
    "minilm": ModelSpec("minilm", "sentence-transformers/all-MiniLM-L6-v2"),
    "e5-small": ModelSpec(
        "e5-small",
        "intfloat/multilingual-e5-small",
        query_prefix="query: ",
        doc_prefix="passage: ",
        match_threshold=0.90,
    ),
    # Optional third model, not part of the default comparison.
    "paraphrase-multi": ModelSpec(
        "paraphrase-multi",
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        match_threshold=0.75,
    ),
}


def load_model(spec: ModelSpec) -> SentenceTransformer:
    return SentenceTransformer(spec.name, device="cpu")


def encode(
    model: SentenceTransformer, texts: list[str], prefix: str = "", batch_size: int = 32
) -> np.ndarray:
    """Return unit-length embeddings, so a dot product is the cosine similarity."""
    return model.encode(
        [prefix + text for text in texts],
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )


def build_dataset(
    cv_count: int, job_count: int, seed: int = 42, year: int = 2026
) -> tuple[list[Record], list[Record]]:
    """Build CVs and jobs in memory. Same seed gives the same records as ml/synthetic/output."""
    fakers = {locale: Faker(locale) for locale in generate.LOCALES}
    cvs = [generate.build_cv(index, seed, year, fakers)[0] for index in range(cv_count)]
    jobs = [generate.build_job(index, seed) for index in range(job_count)]
    return cvs, jobs


def cv_text(cv: Record) -> str:
    """Text the scorer would embed: qualifications only, no name, contact or dates (US-06)."""
    data = cv["parsed_data"]
    lines = [cv["headline"], cv["summary"], "Skills: " + ", ".join(data["skills"]), "Experience:"]
    for job in data["work_history"]:
        lines.append(f"{job['title']} at {job['company']}, {job['years']} years")
        lines += [f"- {bullet}" for bullet in job["bullets"]]
    education = "; ".join(f"{entry['degree']}, {entry['institution']}" for entry in data["education"])
    lines.append("Education: " + education)
    if cv["certifications"]:
        lines.append("Certifications: " + ", ".join(cv["certifications"]))
    return "\n".join(lines)


def job_text(job: Record) -> str:
    return "\n".join(
        [
            job["title"],
            job["description"],
            "Required skills: " + ", ".join(job["required_skills"]),
            "Preferred skills: " + ", ".join(job["preferred_skills"]),
        ]
    )
