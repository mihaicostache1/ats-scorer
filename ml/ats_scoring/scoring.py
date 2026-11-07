"""Hybrid scorer: skill overlap, embedding similarity, experience fit, title and text similarity.

The weights and the model version live in weights.yaml (see ats_scoring.config). Scoring is
pure arithmetic on its inputs: it loads no model and makes no network call. Embeddings are
computed beforehand with ats_scoring.embeddings and passed in.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np

from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG, ScorerConfig
from ats_scoring.schema import ScoreComponents, ScoreResult
from ats_scoring.skills import SkillMatch, match_skills
from ats_scoring.text import candidate_text, job_text, skill_texts, tfidf_similarity
from ats_scoring.titles import TitleMatch, match_title

# Stored with every score. Set in weights.yaml: change it whenever the same input could get a
# different result, for example when the weights or the skill alias table change.
MODEL_VERSION = DEFAULT_CONFIG.model_version

# Share of the total carried by each component, from weights.yaml. Adds up to 1.
WEIGHTS = dict(DEFAULT_CONFIG.weights)

Embedding = Sequence[float] | np.ndarray


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
    if first is None or second is None:
        return None
    norms = float(np.linalg.norm(first)) * float(np.linalg.norm(second))
    if norms == 0:
        return None
    cosine = float(np.dot(first, second)) / norms
    scaled = (cosine - settings.cosine_floor) / (settings.cosine_ceiling - settings.cosine_floor)
    return min(1.0, max(0.0, scaled))


def _years(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return float(value)


def experience_fit(candidate_years: object, min_years: object) -> float | None:
    """1 when the candidate has at least the minimum, falling linearly to 0 at no experience.

    None when either number is missing, and when the job asks for 0 years: a requirement every
    candidate meets says nothing about fit, and would only add the same points to everyone.
    More experience than asked is not penalized: years of experience track age, so the scorer
    only checks that the minimum is met.
    """
    have, need = _years(candidate_years), _years(min_years)
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


def _skill_count(found: int, total: int, kind: str) -> str:
    return f"Has {found} of {total} {kind} skill{'' if total == 1 else 's'}."


def _format_years(years: float) -> str:
    return f"{years:g} year{'' if years == 1 else 's'}"


def _explanations(
    skills: SkillMatch,
    embedding: float | None,
    candidate_years: object,
    min_years: object,
    title: TitleMatch,
    similarity: float,
) -> list[str]:
    """Plain-language reasons for the score, for the breakdown shown to recruiters."""
    lines = []
    if skills.overlap is None:
        lines.append("The job lists no skills, so skills are not part of the score.")
    else:
        required = len(skills.matched_required) + len(skills.missing_required)
        if required:
            lines.append(_skill_count(len(skills.matched_required), required, "required"))
        preferred = len(skills.matched_preferred) + len(skills.missing_preferred)
        if preferred:
            lines.append(_skill_count(len(skills.matched_preferred), preferred, "preferred"))

    if embedding is None:
        lines.append("No embedding is available, so similarity of meaning is not scored.")
    else:
        lines.append(
            f"Similarity of meaning with the job: {_percent(embedding):.0f}/100 "
            "(compared with other candidates, not an absolute grade)."
        )

    have, need = _years(candidate_years), _years(min_years)
    if need is None:
        lines.append("The job gives no minimum experience, so experience is not scored.")
    elif need == 0:
        lines.append("The job asks for no prior experience, so experience is not scored.")
    elif have is None:
        lines.append("The CV gives no total years of experience, so experience is not scored.")
    elif have >= need:
        lines.append(
            f"Has {_format_years(have)} of experience; the job asks for at least "
            f"{_format_years(need)}."
        )
    else:
        lines.append(
            f"Has {_format_years(have)} of experience, below the {_format_years(need)} "
            "the job asks for."
        )

    if title.similarity is None:
        lines.append("No job title to compare, so title fit is not scored.")
    else:
        lines.append(
            f"Closest job title: {title.closest_title} "
            f"(title fit {_percent(title.similarity):.0f}/100, seniority aside)."
        )

    lines.append(
        f"Shared words with the job: {_percent(similarity):.0f}/100. "
        "It counts shared words, not meaning."
    )
    return lines


def score(
    candidate: Mapping[str, Any],
    job: Mapping[str, Any],
    *,
    candidate_embedding: Embedding | None = None,
    job_embedding: Embedding | None = None,
    config: ScorerConfig = DEFAULT_CONFIG,
) -> ScoreResult:
    """Score how well a parsed CV fits a job, from 0 (no fit) to 100.

    `candidate` follows the parsed-CV schema (see `ats_scoring.schema`). `job` uses the job
    fields of the API: `title`, `description`, `required_skills`, `preferred_skills`,
    `min_experience_years`. Fields the scorer does not know are ignored, so a name or a birth
    date in the input cannot change the result.

    `candidate_embedding` and `job_embedding` come from `ats_scoring.embeddings.Embedder`
    with the model named in weights.yaml. Without both, the embedding component is None.

    The total is the weighted mean of the components that could be computed; `weights`
    shows the weights actually applied. The same inputs always give the same result.

    Raises NothingToScoreError (a ValueError) if the candidate or the job has nothing to
    compare, and ValueError if an embedding has the wrong length.
    """
    cv_text = candidate_text(candidate)
    posting_text = job_text(job)
    if not cv_text:
        raise NothingToScoreError("candidate has no skills or text to score")
    if not posting_text:
        raise NothingToScoreError("job has no title, description or skills to score against")

    skills = match_skills(
        skill_texts(candidate.get("skills")),
        job.get("required_skills"),
        job.get("preferred_skills"),
        required_weight=config.required_skill_weight,
        preferred_weight=config.preferred_skill_weight,
    )
    embedding = embedding_similarity(candidate_embedding, job_embedding, config)
    experience = experience_fit(candidate.get("experience_years"), job.get("min_experience_years"))
    title = match_title(candidate, job.get("title"), config.older_title_factor)
    similarity = tfidf_similarity(cv_text, posting_text)

    fractions: dict[str, float | None] = {
        "skill_overlap": skills.overlap,
        "embedding_similarity": embedding,
        "experience_fit": experience,
        "title_similarity": title.similarity,
        "text_similarity": similarity,
    }
    total, weights = _combine(fractions, config.weights)
    components: ScoreComponents = {
        "skill_overlap": None if skills.overlap is None else _percent(skills.overlap),
        "embedding_similarity": None if embedding is None else _percent(embedding),
        "experience_fit": None if experience is None else _percent(experience),
        "title_similarity": None if title.similarity is None else _percent(title.similarity),
        "text_similarity": _percent(similarity),
    }
    return {
        "total": _percent(total),
        "components": components,
        "weights": weights,
        "matched_skills": skills.matched,
        "missing_skills": skills.missing,
        "score_explanations": _explanations(
            skills,
            embedding,
            candidate.get("experience_years"),
            job.get("min_experience_years"),
            title,
            similarity,
        ),
        "model_version": config.model_version,
    }
