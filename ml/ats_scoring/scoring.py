"""Baseline scorer: skill-keyword overlap plus TF-IDF text similarity."""

from collections.abc import Mapping
from typing import Any

from ats_scoring.schema import ScoreResult
from ats_scoring.skills import SkillMatch, match_skills
from ats_scoring.text import candidate_text, job_text, tfidf_similarity

# Stored with every score. Change it whenever the same input could get a different result,
# for example when the weights or the skill alias table change.
MODEL_VERSION = "tfidf-skills-0.1.0"

# Share of the total carried by each component. Must add up to 1.
WEIGHTS = {"skill_overlap": 0.6, "text_similarity": 0.4}


class NothingToScoreError(ValueError):
    """The candidate or the job has no skills and no text, so there is nothing to compare.

    Raised instead of returning 0, which would read as "poor candidate" when the real
    problem is a CV that failed to parse. Callers should send the candidate to manual review.
    """


def _percent(fraction: float) -> float:
    return round(100 * min(1.0, max(0.0, fraction)), 2)


def _skill_count(found: int, total: int, kind: str) -> str:
    return f"Has {found} of {total} {kind} skill{'' if total == 1 else 's'}."


def _explanations(skills: SkillMatch, similarity: float) -> list[str]:
    """Plain-language reasons for the score, for the breakdown shown to recruiters."""
    lines = []
    if skills.overlap is None:
        lines.append("The job lists no skills, so the score is based on text similarity alone.")
    else:
        required = len(skills.matched_required) + len(skills.missing_required)
        if required:
            lines.append(_skill_count(len(skills.matched_required), required, "required"))
        preferred = len(skills.matched_preferred) + len(skills.missing_preferred)
        if preferred:
            lines.append(_skill_count(len(skills.matched_preferred), preferred, "preferred"))
    lines.append(
        f"Text similarity with the job: {_percent(similarity):.0f}/100. "
        "It counts shared words, not meaning."
    )
    return lines


def score(candidate: Mapping[str, Any], job: Mapping[str, Any]) -> ScoreResult:
    """Score how well a parsed CV fits a job, from 0 (no fit) to 100.

    `candidate` follows the parsed-CV schema (see `ats_scoring.schema`). `job` uses the
    job fields of the API: `title`, `description`, `required_skills`, `preferred_skills`.
    Fields the scorer does not know are ignored, so a name or a birth date in the input
    cannot change the result.

    The total is a weighted mix of two components, and `weights` shows the weights
    actually used. If the job lists no skills, the skill component is None and the total
    is the text similarity alone.

    Raises NothingToScoreError (a ValueError) if the candidate or the job has nothing to
    compare.
    """
    cv_text = candidate_text(candidate)
    posting_text = job_text(job)
    if not cv_text:
        raise NothingToScoreError("candidate has no skills or text to score")
    if not posting_text:
        raise NothingToScoreError("job has no title, description or skills to score against")

    skills = match_skills(
        candidate.get("skills"), job.get("required_skills"), job.get("preferred_skills")
    )
    similarity = tfidf_similarity(cv_text, posting_text)
    if skills.overlap is None:
        weights = {"skill_overlap": 0.0, "text_similarity": 1.0}
        overlap = 0.0
    else:
        weights = dict(WEIGHTS)
        overlap = skills.overlap
    total = weights["skill_overlap"] * overlap + weights["text_similarity"] * similarity

    return {
        "total": _percent(total),
        "components": {
            "skill_overlap": None if skills.overlap is None else _percent(skills.overlap),
            "text_similarity": _percent(similarity),
        },
        "weights": weights,
        "matched_skills": skills.matched,
        "missing_skills": skills.missing,
        "score_explanations": _explanations(skills, similarity),
        "model_version": MODEL_VERSION,
    }
