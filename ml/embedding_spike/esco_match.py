"""Prototype: map free-text skills to ESCO concepts with exact, fuzzy and embedding matching.

Needs ESCO's English skills file (skills_en.csv). See README.md for how to get it.
Results go to results/esco_matching_<model>.md and .json.

    python esco_match.py --esco data/skills_en.csv
    python esco_match.py --esco data/skills_en.csv --model e5-small
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer

from common import MODELS, RESULTS_DIR, ModelSpec, Record, encode, generate, load_model

# Edit-distance similarity (0-100) needed to accept a fuzzy match, and the shortest
# string it is trusted for. Two- and three-letter strings are one typo away from each other.
FUZZY_CUTOFF = 90.0
FUZZY_MIN_LENGTH = 4

# Abbreviations and nicknames that neither edit distance nor embeddings resolve reliably.
# Applied after cleaning and before matching. A starter list: extend it from real CVs.
ALIASES = {
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "python3": "python",
    "postgres": "postgresql",
    "k8s": "kubernetes",
    "ml": "machine learning",
    "nlp": "natural language processing",
    "qa": "quality assurance",
    "seo": "search engine optimisation",
    "ci/cd": "continuous integration",
    "golang": "go",
    "node": "node.js",
    "nodejs": "node.js",
    "reactjs": "react",
    "react.js": "react",
    "aws": "amazon web services",
    "gcp": "google cloud platform",
    "oop": "object-oriented programming",
}


@dataclass(frozen=True)
class Probe:
    """A deliberately awkward input, with a rough automatic check of the answer."""

    text: str
    expect: str | None = None  # the matched ESCO label should contain this
    forbid: str | None = None  # ... and must not contain this
    absent: bool = False  # as far as we know ESCO has no such skill: staying unmapped is right


PROBES = (
    Probe("JavaScript", expect="javascript"),
    Probe("JS", expect="javascript"),
    Probe("java script", expect="javascript"),
    Probe("Java", expect="java", forbid="javascript"),
    Probe("TypeScript", expect="typescript"),
    Probe("TS", expect="typescript"),
    Probe("Python", expect="python"),
    Probe("python3", expect="python"),
    Probe("Postgres", expect="postgresql"),
    Probe("k8s", expect="kubernetes"),
    Probe("ML", expect="machine learning"),
    Probe("machine-learning", expect="machine learning"),
    Probe("NLP", expect="natural language processing"),
    Probe("C#", expect="c#"),
    Probe("C++", expect="c++"),
    Probe("C"),
    Probe("Go"),
    Probe("R"),
    Probe("React"),
    Probe("MS Excel"),
    Probe("FastAPI", absent=True),
    Probe("Tailwind CSS", absent=True),
    Probe("SEO", expect="search engine optimi"),
    Probe("QA", expect="quality assurance"),
    Probe("CI/CD", expect="continuous"),
    Probe("Scrum", expect="scrum"),
    Probe("project managment", expect="project management"),
    Probe("comunication skills", expect="communicat"),
    Probe("team work", expect="team"),
    Probe("Teamfähigkeit", expect="team"),
    Probe("învățare automată", expect="machine learning"),
    Probe("gestion de projet", expect="project management"),
)


def clean(text: str) -> str:
    """Normalise a skill string: Unicode form, case and spacing. Keeps '#', '+', '.' and '/'."""
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"\s+", " ", text).strip()
    return text.lstrip("-*• ").rstrip(".,;: ")


def strip_qualifier(label: str) -> str:
    """'Python (computer programming)' -> 'Python'."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", label)


@dataclass
class Esco:
    uris: list[str]
    preferred: list[str]
    labels: list[str]  # cleaned preferred, alternative and hidden labels
    label_concept: list[int]  # concept index of each entry in `labels`
    exact: dict[str, int]  # cleaned label -> concept index; preferred labels win


@dataclass(frozen=True)
class Hit:
    concept: int
    score: float


def load_esco(path: Path) -> Esco:
    csv.field_size_limit(10_000_000)
    with open(path, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = {"conceptUri", "preferredLabel"} - set(reader.fieldnames or [])
        if missing:
            sys.exit(
                f"{path} does not look like ESCO's skills file: no {sorted(missing)} column. "
                f"Columns found: {reader.fieldnames}"
            )
        rows = [row for row in reader if row["conceptUri"] and row["preferredLabel"]]

    esco = Esco(
        uris=[row["conceptUri"] for row in rows],
        preferred=[row["preferredLabel"].strip() for row in rows],
        labels=[],
        label_concept=[],
        exact={},
    )

    def add(label: str, concept: int) -> None:
        for variant in dict.fromkeys((clean(label), clean(strip_qualifier(label)))):
            if variant:
                esco.labels.append(variant)
                esco.label_concept.append(concept)
                esco.exact.setdefault(variant, concept)

    for concept, row in enumerate(rows):
        add(row["preferredLabel"], concept)
    for concept, row in enumerate(rows):
        for column in ("altLabels", "hiddenLabels"):
            for label in re.split(r"[\n|]+", row.get(column) or ""):
                add(label, concept)
    return esco


def esco_embeddings(esco: Esco, model: SentenceTransformer, spec: ModelSpec) -> np.ndarray:
    """Embed every preferred label once and keep the result on disk."""
    cache = RESULTS_DIR / "cache" / f"esco_{spec.key}_{len(esco.preferred)}.npy"
    if cache.exists():
        return np.load(cache)
    print(f"Embedding {len(esco.preferred)} ESCO labels (cached afterwards)...")
    embeddings = encode(model, esco.preferred, spec.query_prefix, batch_size=128)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, embeddings)
    return embeddings


def fuzzy_best(esco: Esco, query: str) -> Hit | None:
    found = process.extractOne(query, esco.labels, scorer=fuzz.ratio)
    if found is None:
        return None
    _label, score, index = found
    return Hit(esco.label_concept[index], float(score))


def nearest(label_embeddings: np.ndarray, vector: np.ndarray) -> Hit:
    similarities = label_embeddings @ vector
    best = int(np.argmax(similarities))
    return Hit(best, float(similarities[best]))


def match_all(
    texts: list[str],
    esco: Esco,
    model: SentenceTransformer,
    spec: ModelSpec,
    label_embeddings: np.ndarray,
    threshold: float,
) -> list[Record]:
    """Run the three matchers on each raw string, then the full pipeline with aliases."""
    cleaned = [clean(text) for text in texts]
    targets = [ALIASES.get(query, query) for query in cleaned]
    unique = list(dict.fromkeys(cleaned + targets))
    # Skill-to-skill comparison is symmetric, so both sides use the query prefix.
    vectors = dict(zip(unique, encode(model, unique, spec.query_prefix, batch_size=128)))

    rows = []
    for text, query, target in zip(texts, cleaned, targets):
        exact = esco.exact.get(query)
        fuzzy = fuzzy_best(esco, query)
        embedding = nearest(label_embeddings, vectors[query])

        final_concept = esco.exact.get(target)
        if final_concept is not None:
            method = "exact" if target == query else "alias + exact"
        elif exact is not None:
            # The alias points at a label ESCO does not have, but the raw string matched.
            final_concept, method = exact, "exact"
        else:
            method = "unmapped"
            candidate = fuzzy_best(esco, target)
            if candidate and len(target) >= FUZZY_MIN_LENGTH and candidate.score >= FUZZY_CUTOFF:
                final_concept, method = candidate.concept, "fuzzy"
            else:
                candidate = nearest(label_embeddings, vectors[target])
                if candidate.score >= threshold:
                    final_concept, method = candidate.concept, "embedding"

        rows.append(
            {
                "input": text,
                "cleaned": query,
                "alias": target if target != query else None,
                "exact": esco.preferred[exact] if exact is not None else None,
                "fuzzy": esco.preferred[fuzzy.concept] if fuzzy else None,
                "fuzzy_score": round(fuzzy.score, 1) if fuzzy else None,
                "fuzzy_accepted": bool(
                    fuzzy and len(query) >= FUZZY_MIN_LENGTH and fuzzy.score >= FUZZY_CUTOFF
                ),
                "embedding": esco.preferred[embedding.concept],
                "embedding_score": round(embedding.score, 3),
                "embedding_accepted": embedding.score >= threshold,
                "final_method": method,
                "final": esco.preferred[final_concept] if final_concept is not None else None,
                "final_uri": esco.uris[final_concept] if final_concept is not None else None,
            }
        )
    return rows


def check(probe: Probe, label: str | None) -> str:
    """Rough automatic verdict. It is a substring test, so read the table before trusting it."""
    if probe.absent:
        return "ok" if label is None else "WRONG"
    if probe.expect is None:
        return "review"
    if label is None:
        return "MISSED"
    lowered = label.casefold()
    if probe.expect in lowered and not (probe.forbid and probe.forbid in lowered):
        return "ok"
    return "WRONG"


def _cell(text: str | None) -> str:
    return (text or "-").replace("|", "/")


def to_markdown(
    esco_path: Path,
    esco: Esco,
    spec: ModelSpec,
    threshold: float,
    probe_rows: list[Record],
    vocabulary_rows: list[Record],
) -> str:
    total = len(vocabulary_rows)

    def share(count: int) -> str:
        return f"{count} ({count / total:.0%})"

    by_method = {
        method: sum(row["final_method"] == method for row in vocabulary_rows)
        for method in ("exact", "alias + exact", "fuzzy", "embedding", "unmapped")
    }
    lines = [
        "# ESCO skill matching results",
        "",
        f"Generated by `esco_match.py`. ESCO file `{esco_path.name}`: {len(esco.preferred)} "
        f"skills, {len(esco.labels)} labels. Embedding model `{spec.name}`.",
        f"Fuzzy match accepted at {FUZZY_CUTOFF:.0f}/100 for strings of {FUZZY_MIN_LENGTH}+ "
        f"characters. Embedding match accepted at cosine {threshold}.",
        "",
        f"## Coverage of the {total} skills used in the synthetic dataset",
        "",
        "Each matcher on the cleaned string, without the alias table:",
        "",
        "| Matcher | Skills matched |",
        "|---|---|",
        f"| Exact | {share(sum(row['exact'] is not None for row in vocabulary_rows))} |",
        f"| Fuzzy | {share(sum(row['fuzzy_accepted'] for row in vocabulary_rows))} |",
        f"| Embedding | {share(sum(row['embedding_accepted'] for row in vocabulary_rows))} |",
        "",
        "Full pipeline (clean, alias, exact, then fuzzy, then embedding):",
        "",
        "| Decided by | Skills |",
        "|---|---|",
        *[f"| {method} | {share(count)} |" for method, count in by_method.items()],
        "",
        "A match is not proof of a correct match. Review the fuzzy and embedding rows below.",
        "",
        "## Awkward inputs",
        "",
        "Each matcher is shown on the raw string. `Final` is the full pipeline. The check "
        "column is a rough substring test against the expected skill.",
        "",
        "| Input | Exact | Fuzzy (score) | Embedding (cosine) | Final (decided by) | Check |",
        "|---|---|---|---|---|---|",
    ]
    for probe, row in zip(PROBES, probe_rows):
        fuzzy = f"{_cell(row['fuzzy'])} ({row['fuzzy_score']})" if row["fuzzy"] else "-"
        final = f"{_cell(row['final'])} ({row['final_method']})"
        lines.append(
            f"| `{row['input']}` | {_cell(row['exact'])} | {fuzzy} | "
            f"{_cell(row['embedding'])} ({row['embedding_score']}) | {final} | "
            f"{check(probe, row['final'])} |"
        )

    lines += [
        "",
        "## Dataset skills not matched exactly",
        "",
        "| Skill | Fuzzy (score) | Embedding (cosine) | Final (decided by) |",
        "|---|---|---|---|",
    ]
    for row in vocabulary_rows:
        if row["final_method"] in ("exact", "alias + exact"):
            continue
        fuzzy = f"{_cell(row['fuzzy'])} ({row['fuzzy_score']})" if row["fuzzy"] else "-"
        lines.append(
            f"| {row['input']} | {fuzzy} | {_cell(row['embedding'])} ({row['embedding_score']}) | "
            f"{_cell(row['final'])} ({row['final_method']}) |"
        )
    lines.append("")
    return "\n".join(lines)


def dataset_vocabulary() -> list[str]:
    """Every skill name the synthetic CVs and jobs can contain."""
    skills: list[str] = []
    for family in generate.FAMILIES:
        skills += [*family.core, *family.extra]
    skills += generate.SOFT_SKILLS
    return sorted(dict.fromkeys(skills), key=str.casefold)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--esco", type=Path, required=True, help="path to ESCO's skills_en.csv")
    parser.add_argument(
        "--model", choices=sorted(MODELS), default="minilm", help="embedding model (default: minilm)"
    )
    parser.add_argument(
        "--threshold", type=float, help="cosine needed to accept an embedding match"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    # The report contains non-English test strings, which a redirected Windows console cannot print.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not args.esco.is_file():
        sys.exit(f"ESCO file not found: {args.esco}. See README.md for how to download it.")
    spec = MODELS[args.model]
    threshold = args.threshold if args.threshold is not None else spec.match_threshold

    esco = load_esco(args.esco)
    print(f"Loaded {len(esco.preferred)} ESCO skills with {len(esco.labels)} labels")
    model = load_model(spec)
    label_embeddings = esco_embeddings(esco, model, spec)

    probe_rows = match_all(
        [probe.text for probe in PROBES], esco, model, spec, label_embeddings, threshold
    )
    vocabulary_rows = match_all(dataset_vocabulary(), esco, model, spec, label_embeddings, threshold)

    RESULTS_DIR.mkdir(exist_ok=True)
    report = to_markdown(args.esco, esco, spec, threshold, probe_rows, vocabulary_rows)
    stem = f"esco_matching_{spec.key}"
    (RESULTS_DIR / f"{stem}.md").write_text(report, encoding="utf-8", newline="\n")
    payload = {
        "esco_file": args.esco.name,
        "model": spec.name,
        "embedding_threshold": threshold,
        "fuzzy_cutoff": FUZZY_CUTOFF,
        "probes": probe_rows,
        "vocabulary": vocabulary_rows,
    }
    (RESULTS_DIR / f"{stem}.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print(report)
    print(f"Saved to {RESULTS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
