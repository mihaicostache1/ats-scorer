"""Hybrid scorer: skill overlap, embedding similarity, experience fit, title and text similarity.

The weights and the model version live in weights.yaml (see ats_scoring.config). Scoring is
pure arithmetic on its inputs: it loads no model and makes no network call. Embeddings are
computed beforehand with ats_scoring.embeddings and passed in.

`score()` scores one candidate. `score_batch()` scores many candidates against one job, as a
ranking does: it prepares the job once and gives each candidate exactly what `score()` gives.
"""

from collections.abc import Iterable, Mapping, Sequence, Sized
from dataclasses import dataclass
from typing import Any

import numpy as np

from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG, ScorerConfig
from ats_scoring.explanation import build_explanation, skill_lines, years_or_none
from ats_scoring.redaction import redact
from ats_scoring.schema import ScoreComponents, ScoreResult
from ats_scoring.skills import match_skills
from ats_scoring.text import candidate_text, job_text, skill_texts, tfidf_similarity, tokenize
from ats_scoring.titles import match_title
from ats_scoring.versioning import get_model_version

# Stored with every score: the scorer version plus hashes of the settings, the embedding model
# and the vocabularies (ats_scoring.versioning). Changes by itself when weights.yaml does.
MODEL_VERSION = get_model_version()

# Share of the total carried by each component, from weights.yaml. Adds up to 1.
WEIGHTS = dict(DEFAULT_CONFIG.weights)

Embedding = Sequence[float] | np.ndarray

# Version string the backend stores next to each embedding (B-17). A vector recorded with
# another version came from another model: pass None for it instead.
EMBEDDING_MODEL_VERSION = f"{DEFAULT_CONFIG.embedding.model}@{DEFAULT_CONFIG.embedding.revision}"


class NothingToScoreError(ValueError):
    """The candidate or the job has no skills and no text, so there is nothing to compare.

    Raised instead of returning 0, which would read as "poor candidate" when the real
    problem is a CV that failed to parse. Callers should send the candidate to manual review.
    """


def _percent(fraction: float) -> float:
    return round(100 * min(1.0, max(0.0, fraction)), 2)


def _vector(value: Embedding | None, name: str, dimensions: int) -> np.ndarray | None:
    if value is None:
        return None
    vector = np.asarray(value, dtype=np.float64)
    if vector.shape != (dimensions,):
        raise ValueError(f"{name} must have {dimensions} numbers, not shape {vector.shape}")
    if not np.all(np.isfinite(vector)):
        raise ValueError(f"{name} holds a NaN or an infinite value")
    return vector


def embedding_similarity(
    candidate_embedding: Embedding | None,
    job_embedding: Embedding | None,
    config: ScorerConfig = DEFAULT_CONFIG,
) -> float | None:
    """Cosine of the two embeddings, rescaled from [floor, ceiling] to 0-1. None if one is
    missing or all zeros."""
    settings = config.embedding
    first = _vector(candidate_embedding, "candidate_embedding", settings.dimensions)
    second = _vector(job_embedding, "job_embedding", settings.dimensions)
    return _scaled_cosine(first, second, config)


def _scaled_cosine(
    first: np.ndarray | None, second: np.ndarray | None, config: ScorerConfig
) -> float | None:
    settings = config.embedding
    if first is None or second is None:
        return None
    norms = float(np.linalg.norm(first)) * float(np.linalg.norm(second))
    if norms == 0:
        return None
    cosine = float(np.dot(first, second)) / norms
    scaled = (cosine - settings.cosine_floor) / (settings.cosine_ceiling - settings.cosine_floor)
    return min(1.0, max(0.0, scaled))


def experience_fit(candidate_years: object, min_years: object) -> float | None:
    """1 when the candidate has at least the minimum, falling linearly to 0 at no experience.

    None when either number is missing, and when the job asks for 0 years: a requirement every
    candidate meets says nothing about fit, and would only add the same points to everyone.
    More experience than asked is not penalized: years of experience track age, so the scorer
    only checks that the minimum is met.
    """
    have, need = years_or_none(candidate_years), years_or_none(min_years)
    if have is None or need is None or need == 0:
        return None
    if have >= need:
        return 1.0
    return have / need


def _combine(
    components: Mapping[str, float | None], weights: Mapping[str, float]
) -> tuple[float, dict[str, float]]:
    """Weighted mean of the components that are present, and the weights actually used."""
    present = {name: weights[name] for name in COMPONENTS if components[name] is not None}
    share = sum(present.values())
    if share <= 0:
        # Only components with weight 0 are present: fall back to an even split of them.
        present = dict.fromkeys(present, 1.0)
        share = float(len(present))
    used = {name: round(present.get(name, 0.0) / share, 4) for name in COMPONENTS}
    total = sum(
        present[name] / share * float(value)
        for name, value in components.items()
        if value is not None and name in present
    )
    return total, used


@dataclass(frozen=True)
class _Job:
    """What every candidate is compared with: the job's fields, read once."""

    fields: Mapping[str, Any]
    text: str
    tokens: list[str]
    embedding: np.ndarray | None


def _prepare_job(
    job: Mapping[str, Any], job_embedding: Embedding | None, config: ScorerConfig
) -> _Job:
    posting_text = job_text(job)
    if not posting_text:
        raise NothingToScoreError("job has no title, description or skills to score against")
    embedding = _vector(job_embedding, "job_embedding", config.embedding.dimensions)
    return _Job(job, posting_text, tokenize(posting_text), embedding)


def _names(value: Iterable[str] | str | None) -> tuple[str, ...]:
    """Extra names as a tuple. A single string is one name, not a sequence of letters."""
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    return tuple(value)


def _score_one(
    candidate: Mapping[str, Any],
    job: _Job,
    candidate_embedding: np.ndarray | None,
    additional_names: tuple[str, ...],
    config: ScorerConfig,
    model_version: str,
) -> ScoreResult:
    """Score one candidate against a prepared job. Shared by score() and score_batch().

    `model_version` is get_model_version(config), computed once per call by the caller.
    """
    candidate = redact(candidate, additional_names=additional_names)
    cv_text = candidate_text(candidate)
    if not cv_text:
        raise NothingToScoreError("candidate has no skills or text to score")
    fields = job.fields

    cv_skills = skill_texts(candidate.get("skills"))
    skills = match_skills(
        cv_skills,
        fields.get("required_skills"),
        fields.get("preferred_skills"),
        required_weight=config.required_skill_weight,
        preferred_weight=config.preferred_skill_weight,
    )
    embedding = _scaled_cosine(candidate_embedding, job.embedding, config)
    experience = experience_fit(
        candidate.get("experience_years"), fields.get("min_experience_years")
    )
    title = match_title(candidate, fields.get("title"), config.older_title_factor)
    similarity = tfidf_similarity(cv_text, job.text, second_tokens=job.tokens)

    fractions: dict[str, float | None] = {
        "skill_overlap": skills.overlap,
        "embedding_similarity": embedding,
        "experience_fit": experience,
        "title_similarity": title.similarity,
        "text_similarity": similarity,
    }
    exact_total, weights = _combine(fractions, config.weights)
    components: ScoreComponents = {
        "skill_overlap": None if skills.overlap is None else _percent(skills.overlap),
        "embedding_similarity": None if embedding is None else _percent(embedding),
        "experience_fit": None if experience is None else _percent(experience),
        "title_similarity": None if title.similarity is None else _percent(title.similarity),
        "text_similarity": _percent(similarity),
    }
    total = _percent(exact_total)
    explanation = build_explanation(
        total=total,
        components=components,
        weights=weights,
        skills=skills,
        cv_skills=cv_skills,
        candidate_years=candidate.get("experience_years"),
        min_years=fields.get("min_experience_years"),
        bands=config.bands,
        model_version=model_version,
    )
    return {
        "total": total,
        "components": components,
        "weights": weights,
        "matched_skills": skills.matched,
        "missing_skills": skills.missing,
        # The same sentences as the explanation, with skills split into required and nice-to-have.
        "score_explanations": [
            *skill_lines(skills),
            *(part["statement"] for part in explanation["components"][1:]),
        ],
        "model_version": model_version,
        "explanation": explanation,
    }


def score(
    candidate: Mapping[str, Any],
    job: Mapping[str, Any],
    *,
    candidate_embedding: Embedding | None = None,
    job_embedding: Embedding | None = None,
    additional_names: Iterable[str] | str = (),
    config: ScorerConfig = DEFAULT_CONFIG,
) -> ScoreResult:
    """Score how well a parsed CV fits a job, from 0 (no fit) to 100.

    `candidate` follows the parsed-CV schema (see `ats_scoring.schema`). `job` uses the job
    fields of the API: `title`, `description`, `required_skills`, `preferred_skills`,
    `min_experience_years`. The candidate is passed through `redact()` first, so a name,
    contact details, dates, a birth date or gendered words cannot change the result, even
    inside the summary or a bullet (US-06). `additional_names` are other names of the
    candidate to remove too (the record's full name, earlier names), the same ones the
    backend passes when it embeds the CV.

    `candidate_embedding` and `job_embedding` come from `ats_scoring.embeddings.Embedder`
    with the model named in weights.yaml. Without both, the embedding component is None.

    The total is the weighted mean of the components that could be computed; `weights`
    shows the weights actually applied. The same inputs always give the same result.

    Raises NothingToScoreError (a ValueError) if the candidate or the job has nothing to
    compare, and ValueError if an embedding has the wrong length.
    """
    prepared = _prepare_job(job, job_embedding, config)
    vector = _vector(candidate_embedding, "candidate_embedding", config.embedding.dimensions)
    version = get_model_version(config)
    return _score_one(candidate, prepared, vector, _names(additional_names), config, version)


def _check_lines_up(name: str, values: Sized | None, candidates: Sized) -> None:
    if values is None:
        return
    if isinstance(values, str):
        raise TypeError(f"{name} must have one entry per candidate, not a single string")
    if len(values) != len(candidates):
        raise ValueError(f"{name} has {len(values)} entries for {len(candidates)} candidates")


def score_batch(
    job: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
    *,
    candidate_embeddings: Sequence[Embedding | None] | np.ndarray | None = None,
    job_embedding: Embedding | None = None,
    additional_names: Sequence[Iterable[str] | str | None] | None = None,
    config: ScorerConfig = DEFAULT_CONFIG,
) -> list[ScoreResult | None]:
    """Score many candidates against one job: one result per candidate, in the same order.

    Each result is exactly what `score(candidate, job, ...)` returns for that candidate, and
    does not depend on the other candidates in the batch. The job is read, tokenized and its
    embedding checked once, instead of once per candidate.

    `candidate_embeddings` lines up with `candidates`: a list with one vector or None per
    candidate, or a 2-D array with one row per candidate. A vector can be a list of floats or
    a NumPy array of any float type. None (the default) scores without embeddings.

    `additional_names` lines up with `candidates` too: for each candidate, the other names to
    remove before scoring (see `score()`), or None. None (the default) adds no names.

    A candidate with nothing to score gets None instead of a result, so one CV that failed to
    parse does not stop the ranking: send it to manual review, as for NothingToScoreError
    from `score()`.

    Raises NothingToScoreError if the job has nothing to compare, and ValueError if
    `candidate_embeddings` or `additional_names` does not have one entry per candidate, or an
    embedding has the wrong length (the message gives its position).
    """
    prepared = _prepare_job(job, job_embedding, config)
    dimensions = config.embedding.dimensions
    _check_lines_up("candidate_embeddings", candidate_embeddings, candidates)
    _check_lines_up("additional_names", additional_names, candidates)
    if candidate_embeddings is None:
        vectors: list[np.ndarray | None] = [None] * len(candidates)
    else:
        vectors = [
            _vector(value, f"candidate_embeddings[{index}]", dimensions)
            for index, value in enumerate(candidate_embeddings)
        ]

    names = (
        [()] * len(candidates)
        if additional_names is None
        else [_names(entry) for entry in additional_names]
    )

    version = get_model_version(config)
    results: list[ScoreResult | None] = []
    for candidate, vector, extra in zip(candidates, vectors, names, strict=True):
        try:
            results.append(_score_one(candidate, prepared, vector, extra, config, version))
        except NothingToScoreError:
            results.append(None)
    return results
