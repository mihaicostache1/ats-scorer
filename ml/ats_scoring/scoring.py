"""Baseline scorer: skill-keyword overlap plus TF-IDF text similarity."""

from collections.abc import Mapping
from typing import Any

from ats_scoring.schema import ScoreResult
from ats_scoring.skills import match_skills
from ats_scoring.text import candidate_text, job_text, tfidf_similarity

# Stored with every score. Change it whenever the same input could get a different result.
MODEL_VERSION = "tfidf-skills-0.1.0"

# Share of the total carried by each component. Must add up to 1.
WEIGHTS = {"skill_overlap": 0.6, "text_similarity": 0.4}


def _percent(fraction: float) -> float:
    return round(100 * min(1.0, max(0.0, fraction)), 2)


def score(candidate: Mapping[str, Any], job: Mapping[str, Any]) -> ScoreResult:
    """Score how well a parsed CV fits a job, from 0 (no fit) to 100.

    `candidate` follows the parsed-CV schema (see `ats_scoring.schema`). `job` uses the
    job fields of the API: `title`, `description`, `required_skills`, `preferred_skills`.
    Fields the scorer does not know are ignored, so a name or a birth date in the input
    cannot change the result.

    The total is a weighted mix of two components (see `WEIGHTS`). If the job lists no
    skills, the skill component is None and the total is the text similarity alone.

    Raises ValueError if the candidate or the job has nothing to compare. A total of 0
    would wrongly read as "poor candidate" when the real problem is a CV that failed to
    parse, so the caller has to handle that case.
    """
    cv_text = candidate_text(candidate)
    posting_text = job_text(job)
    if not cv_text:
        raise ValueError("candidate has no skills or text to score")
    if not posting_text:
        raise ValueError("job has no title, description or skills to score against")

    skills = match_skills(
        candidate.get("skills"), job.get("required_skills"), job.get("preferred_skills")
    )
    similarity = tfidf_similarity(cv_text, posting_text)
    if skills.overlap is None:
        total = similarity
    else:
        total = WEIGHTS["skill_overlap"] * skills.overlap + WEIGHTS["text_similarity"] * similarity

    return {
        "total": _percent(total),
        "components": {
            "skill_overlap": None if skills.overlap is None else _percent(skills.overlap),
            "text_similarity": _percent(similarity),
        },
        "matched_skills": skills.matched,
        "missing_skills": skills.missing,
        "model_version": MODEL_VERSION,
    }
