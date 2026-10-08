"""Compare sentence-embedding models on ranking quality and CPU speed.

Quality is measured on the synthetic CVs and jobs from ml/synthetic (same seed, so the
same candidates as in its output folder). Speed is measured on a batch of generated CVs.
Results go to results/model_comparison.md and results/model_comparison.json.

    python compare_models.py
    python compare_models.py --models minilm e5-small paraphrase-multi --speed-docs 1000
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import statistics
import time
from collections import defaultdict
from importlib import metadata
from pathlib import Path

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from common import (
    MODELS,
    RESULTS_DIR,
    ModelSpec,
    Record,
    build_dataset,
    cv_text,
    encode,
    job_text,
    load_model,
)

# One short job summary per role family, written in other languages, to see whether a
# model can match a non-English job against the English CVs.
CROSS_LINGUAL = {
    "de": {
        "backend": "Wir suchen einen Backend-Entwickler mit Erfahrung in der Entwicklung von "
        "Server-Anwendungen, Datenbanken und Programmierschnittstellen.",
        "frontend": "Gesucht wird ein Frontend-Entwickler, der barrierefreie und responsive "
        "Benutzeroberflächen für Webanwendungen baut.",
        "data_science": "Wir suchen einen Data Scientist, der Modelle für maschinelles Lernen "
        "trainiert, auswertet und Ergebnisse verständlich präsentiert.",
        "devops": "Gesucht wird ein DevOps-Ingenieur für den Betrieb unserer Cloud-Infrastruktur, "
        "automatisierte Bereitstellungen und Überwachung.",
        "qa": "Wir suchen einen Softwaretester, der Testpläne erstellt, automatisierte Tests "
        "schreibt und Fehler dokumentiert.",
        "mobile": "Gesucht wird ein Entwickler für mobile Apps auf Android und iOS, der neue "
        "Funktionen bis zur Veröffentlichung im App Store umsetzt.",
        "data_analyst": "Wir suchen einen Datenanalysten, der Berichte und Dashboards erstellt "
        "und Geschäftsdaten auswertet.",
        "product": "Gesucht wird ein Produktmanager, der die Produktstrategie verantwortet, "
        "Anforderungen priorisiert und mit Nutzern spricht.",
        "ux_design": "Wir suchen einen UX-Designer, der Nutzerforschung durchführt und "
        "Wireframes sowie Prototypen gestaltet.",
        "marketing": "Gesucht wird ein Marketing-Spezialist für Kampagnen in sozialen Medien, "
        "Suchmaschinenoptimierung und Newsletter.",
    },
    "fr": {
        "backend": "Nous recherchons un développeur back-end expérimenté dans la conception de "
        "services, de bases de données et d'interfaces de programmation.",
        "frontend": "Nous recherchons un développeur front-end pour créer des interfaces web "
        "accessibles et adaptées aux mobiles.",
        "data_science": "Nous recherchons un data scientist capable d'entraîner et d'évaluer des "
        "modèles d'apprentissage automatique et de présenter ses résultats.",
        "devops": "Nous recherchons un ingénieur DevOps pour exploiter notre infrastructure "
        "cloud, automatiser les déploiements et assurer la supervision.",
        "qa": "Nous recherchons un testeur logiciel pour rédiger des plans de test, automatiser "
        "les tests et suivre les anomalies.",
        "mobile": "Nous recherchons un développeur d'applications mobiles Android et iOS, de la "
        "conception à la publication sur les stores.",
        "data_analyst": "Nous recherchons un analyste de données pour construire des tableaux de "
        "bord et des rapports et analyser les données de l'entreprise.",
        "product": "Nous recherchons un chef de produit pour définir la stratégie produit, "
        "prioriser le backlog et échanger avec les utilisateurs.",
        "ux_design": "Nous recherchons un designer UX pour mener des recherches utilisateurs et "
        "concevoir des maquettes et des prototypes.",
        "marketing": "Nous recherchons un spécialiste marketing pour gérer des campagnes sur les "
        "réseaux sociaux, le référencement naturel et l'emailing.",
    },
    "ro": {
        "backend": "Căutăm un programator backend cu experiență în dezvoltarea de servicii, baze "
        "de date și interfețe de programare.",
        "frontend": "Căutăm un programator frontend care să construiască interfețe web accesibile "
        "și adaptate pentru mobil.",
        "data_science": "Căutăm un specialist în știința datelor care să antreneze și să evalueze "
        "modele de învățare automată și să prezinte rezultatele.",
        "devops": "Căutăm un inginer DevOps pentru administrarea infrastructurii cloud, "
        "automatizarea livrărilor și monitorizare.",
        "qa": "Căutăm un tester software care să scrie planuri de testare, să automatizeze "
        "testele și să urmărească defectele.",
        "mobile": "Căutăm un dezvoltator de aplicații mobile pentru Android și iOS, de la "
        "proiectare până la publicarea în magazinele de aplicații.",
        "data_analyst": "Căutăm un analist de date care să realizeze rapoarte și tablouri de bord "
        "și să analizeze datele companiei.",
        "product": "Căutăm un manager de produs care să definească strategia de produs, să "
        "prioritizeze cerințele și să discute cu utilizatorii.",
        "ux_design": "Căutăm un designer UX care să facă cercetare cu utilizatorii și să creeze "
        "schițe și prototipuri.",
        "marketing": "Căutăm un specialist în marketing pentru campanii pe rețelele sociale, "
        "optimizare pentru motoarele de căutare și newslettere.",
    },
}


# --------------------------------------------------------------------------- quality


def silver_label(cv: Record, job: Record) -> int:
    """Rough 0-3 relevance computed from the generator's ground truth.

    This stands in for human ratings until they exist. It follows the rating scale in
    ml/synthetic/README.md, but it is a rule, not a person's judgement.
    """
    if cv["role_family"] != job["role_family"]:
        return 0
    data = cv["parsed_data"]
    required = job["required_skills"]
    coverage = len(set(data["skills"]) & set(required)) / len(required)
    enough_experience = data["experience_years"] >= job["min_experience_years"]
    if coverage >= 0.6 and enough_experience:
        return 3
    if coverage >= 0.4 or enough_experience:
        return 2
    return 1


def ndcg_at_k(ranked_gains: list[float], k: int = 10) -> float:
    def dcg(gains: list[float]) -> float:
        return sum((2**gain - 1) / math.log2(rank + 2) for rank, gain in enumerate(gains[:k]))

    ideal = dcg(sorted(ranked_gains, reverse=True))
    return dcg(ranked_gains) / ideal if ideal > 0 else 0.0


def ranking_metrics(scores: np.ndarray, cvs: list[Record], jobs: list[Record]) -> dict[str, float]:
    """Average ranking quality over all jobs. `scores` is jobs x CVs cosine similarity."""
    precision, reciprocal_rank, ndcg = [], [], []
    for row, job in zip(scores, jobs):
        order = np.argsort(-row)
        gains = [silver_label(cv, job) for cv in cvs]
        ranked = [gains[index] for index in order]
        precision.append(sum(gain > 0 for gain in ranked[:10]) / 10)
        first = next((rank for rank, gain in enumerate(ranked, start=1) if gain > 0), None)
        reciprocal_rank.append(1 / first if first else 0.0)
        ndcg.append(ndcg_at_k(ranked))
    return {
        "precision_at_10_same_family": statistics.fmean(precision),
        "mrr_same_family": statistics.fmean(reciprocal_rank),
        "ndcg_at_10_silver": statistics.fmean(ndcg),
    }


def family_precision(scores: np.ndarray, families: list[str], cvs: list[Record]) -> float:
    """Share of the top 10 CVs that belong to the family each query was written for."""
    values = []
    for row, family in zip(scores, families):
        top = np.argsort(-row)[:10]
        values.append(sum(cvs[index]["role_family"] == family for index in top) / 10)
    return statistics.fmean(values)


def load_ratings(path: Path) -> dict[str, dict[str, float]]:
    """Read a human-rating CSV into {job_id: {candidate_id: mean rating}}."""
    collected: dict[tuple[str, str], list[int]] = defaultdict(list)
    with open(path, encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if (row.get("rating") or "").strip():
                collected[(row["job_id"], row["candidate_id"])].append(int(row["rating"]))
    ratings: dict[str, dict[str, float]] = defaultdict(dict)
    for (job_id, candidate_id), values in collected.items():
        ratings[job_id][candidate_id] = statistics.fmean(values)
    return ratings


def human_ndcg(
    scores: np.ndarray, cvs: list[Record], jobs: list[Record], ratings: dict[str, dict[str, float]]
) -> dict[str, float]:
    """nDCG@10 against human ratings, ranking only the candidates that were rated."""
    values = []
    for row, job in zip(scores, jobs):
        rated = ratings.get(job["job_id"], {})
        pairs = [
            (row[index], rated[cv["candidate_id"]])
            for index, cv in enumerate(cvs)
            if cv["candidate_id"] in rated
        ]
        if pairs:
            pairs.sort(key=lambda pair: -pair[0])
            values.append(ndcg_at_k([gain for _, gain in pairs]))
    return {"ndcg_at_10_human": statistics.fmean(values) if values else 0.0, "jobs_rated": len(values)}


# --------------------------------------------------------------------------- speed


def token_stats(model: SentenceTransformer, texts: list[str]) -> Record | None:
    """How long the documents are in tokens, and how many the model would cut short."""
    try:
        encoded = model.tokenizer(texts, add_special_tokens=True, truncation=False)
        lengths = [len(ids) for ids in encoded["input_ids"]]
        limit = int(model.max_seq_length)
    except Exception as error:  # noqa: BLE001 - tokenizer access differs between library versions
        print(f"  could not count tokens: {error}")
        return None
    return {
        "max_seq_length": limit,
        "median_tokens": int(statistics.median(lengths)),
        "max_tokens": max(lengths),
        "share_truncated": sum(length > limit for length in lengths) / len(lengths),
    }


def benchmark(
    spec: ModelSpec,
    cvs: list[Record],
    jobs: list[Record],
    speed_texts: list[str],
    args: argparse.Namespace,
    ratings: dict[str, dict[str, float]] | None,
) -> Record:
    print(f"\n{spec.name}")
    started = time.perf_counter()
    model = load_model(spec)
    load_seconds = time.perf_counter() - started

    encode(model, speed_texts[:16], spec.doc_prefix, args.batch_size)  # warm-up, not timed
    # Timed several times and the median kept: one pass can be thrown off by whatever
    # else the machine is doing.
    batch_runs = []
    for _ in range(max(1, args.repeats)):
        started = time.perf_counter()
        batch = encode(model, speed_texts, spec.doc_prefix, args.batch_size)
        batch_runs.append(time.perf_counter() - started)
        print(f"  {len(speed_texts)} documents in {batch_runs[-1]:.1f} s")
    batch_seconds = statistics.median(batch_runs)

    single = []
    for text in speed_texts[: args.single_docs]:
        started = time.perf_counter()
        encode(model, [text], spec.doc_prefix, 1)
        single.append(time.perf_counter() - started)

    cv_embeddings = encode(model, [cv_text(cv) for cv in cvs], spec.doc_prefix, args.batch_size)
    job_embeddings = encode(model, [job_text(job) for job in jobs], spec.query_prefix, args.batch_size)
    scores = job_embeddings @ cv_embeddings.T
    quality = ranking_metrics(scores, cvs, jobs)
    if ratings:
        quality.update(human_ndcg(scores, cvs, jobs, ratings))

    cross_lingual = {}
    for language, queries in CROSS_LINGUAL.items():
        families = list(queries)
        embeddings = encode(model, [queries[family] for family in families], spec.query_prefix)
        cross_lingual[language] = family_precision(embeddings @ cv_embeddings.T, families, cvs)

    return {
        "key": spec.key,
        "model": spec.name,
        "dimension": int(batch.shape[1]),
        "parameters_millions": round(sum(p.numel() for p in model.parameters()) / 1e6, 1),
        "tokens": token_stats(model, [spec.doc_prefix + text for text in speed_texts]),
        "load_seconds": round(load_seconds, 2),
        "batch_documents": len(speed_texts),
        "batch_size": args.batch_size,
        "batch_seconds": round(batch_seconds, 2),
        "batch_runs_seconds": [round(seconds, 2) for seconds in batch_runs],
        "batch_ms_per_document": round(batch_seconds / len(speed_texts) * 1000, 2),
        "single_ms_per_document_median": round(statistics.median(single) * 1000, 2),
        "quality_english": {name: round(value, 3) for name, value in quality.items()},
        "precision_at_10_cross_lingual": {k: round(v, 3) for k, v in cross_lingual.items()},
    }


# --------------------------------------------------------------------------- report


def _version(package: str) -> str:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return "not installed"


def environment() -> Record:
    return {
        "date": time.strftime("%Y-%m-%d"),
        "cpu": platform.processor() or platform.machine(),
        "logical_cores": os.cpu_count(),
        "torch_threads": torch.get_num_threads(),
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "torch": _version("torch"),
        "sentence_transformers": _version("sentence-transformers"),
        "transformers": _version("transformers"),
    }


def to_markdown(env: Record, results: list[Record], args: argparse.Namespace) -> str:
    lines = [
        "# Model comparison results",
        "",
        f"Generated by `compare_models.py` on {env['date']}. CPU only.",
        "",
        f"- CPU: {env['cpu']} ({env['logical_cores']} logical cores, {env['torch_threads']} "
        "torch threads)",
        f"- {env['os']}, Python {env['python']}, torch {env['torch']}, "
        f"sentence-transformers {env['sentence_transformers']}",
        f"- Data: {args.cvs} synthetic CVs and {args.jobs} jobs for quality (seed {args.seed}), "
        f"{args.speed_docs} synthetic CVs for speed",
        "",
        "## Size and speed",
        "",
        "| Model | Dimension | Parameters | Token limit | Median CV tokens | CVs cut short | "
        f"Load | {args.speed_docs} CVs (median) | Per CV (batch) | Per CV (one at a time) |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for result in results:
        tokens = result["tokens"]
        token_cells = (
            f"{tokens['max_seq_length']} | {tokens['median_tokens']} | "
            f"{tokens['share_truncated']:.0%}"
            if tokens
            else "n/a | n/a | n/a"
        )
        lines.append(
            f"| `{result['model']}` | {result['dimension']} | {result['parameters_millions']}M | "
            f"{token_cells} | {result['load_seconds']} s | {result['batch_seconds']} s | "
            f"{result['batch_ms_per_document']} ms | {result['single_ms_per_document_median']} ms |"
        )

    lines.append("")
    for result in results:
        runs = ", ".join(f"{seconds} s" for seconds in result["batch_runs_seconds"])
        lines.append(f"- Batch passes for `{result['key']}`: {runs}")

    has_human = any("ndcg_at_10_human" in result["quality_english"] for result in results)
    header = "| Model | P@10 same family | MRR | nDCG@10 (silver labels) |"
    divider = "|---|---|---|---|"
    if has_human:
        header += " nDCG@10 (human ratings) |"
        divider += "---|"
    lines += ["", "## Ranking quality, English jobs against English CVs", "", header, divider]
    for result in results:
        quality = result["quality_english"]
        row = (
            f"| `{result['model']}` | {quality['precision_at_10_same_family']:.3f} | "
            f"{quality['mrr_same_family']:.3f} | {quality['ndcg_at_10_silver']:.3f} |"
        )
        if has_human:
            row += f" {quality.get('ndcg_at_10_human', 0):.3f} |"
        lines.append(row)

    languages = list(CROSS_LINGUAL)
    lines += [
        "",
        "## Cross-lingual: job summary in another language against English CVs",
        "",
        "P@10 same family, averaged over 10 one-sentence job summaries per language.",
        "",
        "| Model | " + " | ".join(languages) + " |",
        "|---|" + "---|" * len(languages),
    ]
    for result in results:
        cells = " | ".join(
            f"{result['precision_at_10_cross_lingual'][language]:.3f}" for language in languages
        )
        lines.append(f"| `{result['model']}` | {cells} |")

    lines += [
        "",
        "Silver labels are computed from the generator's ground truth (same role family, "
        "required-skill coverage, experience). They are not human judgements.",
        "",
    ]
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--models",
        nargs="+",
        choices=sorted(MODELS),
        default=["minilm", "e5-small"],
        help="models to compare (default: minilm e5-small)",
    )
    parser.add_argument("--seed", type=int, default=42, help="dataset seed (default: 42)")
    parser.add_argument("--cvs", type=int, default=100, help="CVs in the quality test")
    parser.add_argument("--jobs", type=int, default=20, help="jobs in the quality test")
    parser.add_argument("--speed-docs", type=int, default=1000, help="CVs in the speed batch")
    parser.add_argument("--batch-size", type=int, default=32, help="encoding batch size")
    parser.add_argument(
        "--repeats", type=int, default=3, help="timed passes over the speed batch (median kept)"
    )
    parser.add_argument(
        "--single-docs", type=int, default=30, help="CVs encoded one at a time for latency"
    )
    parser.add_argument("--threads", type=int, help="limit torch to this many CPU threads")
    parser.add_argument("--ratings", type=Path, help="human ratings CSV (candidate_id,job_id,rating)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)

    cvs, jobs = build_dataset(args.cvs, args.jobs, args.seed)
    speed_cvs, _ = build_dataset(args.speed_docs, 0, args.seed)
    speed_texts = [cv_text(cv) for cv in speed_cvs]
    ratings = load_ratings(args.ratings) if args.ratings else None

    env = environment()
    results = [
        benchmark(MODELS[key], cvs, jobs, speed_texts, args, ratings) for key in args.models
    ]

    RESULTS_DIR.mkdir(exist_ok=True)
    report = to_markdown(env, results, args)
    (RESULTS_DIR / "model_comparison.md").write_text(report, encoding="utf-8", newline="\n")
    payload = {"environment": env, "arguments": vars(args) | {"ratings": str(args.ratings)}}
    payload["results"] = results
    (RESULTS_DIR / "model_comparison.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print("\n" + report)
    print(f"Saved to {RESULTS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
