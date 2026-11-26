"""The explanation returned with every score (L-17, US-09).

Every sentence comes from `TEMPLATES`, filled in with numbers and skill names, never from a
language model: the same score always gets the same words, and each text can be reviewed here.
The explanation is built from the redacted CV only (`ats_scoring.redaction`), so it holds no
name, contact detail, date or gender-coded word. Its shape: `ats_scoring.score_explanation`.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any, Final, get_args

from ats_scoring.config import BandSettings
from ats_scoring.schema import ScoreComponents
from ats_scoring.score_explanation import (
    EXPLANATION_VERSION,
    Band,
    ComponentName,
    ExperienceStatus,
)
from ats_scoring.skills import SkillMatch, normalize_skill

# Every text the explanation can contain. Keys name the situation; values are str.format
# templates. A new situation gets a new key here, never text built elsewhere.
TEMPLATES: Final[Mapping[str, str]] = {
    "band.strong": "Strong match.",
    "band.moderate": "Moderate match.",
    "band.weak": "Weak match.",
    "skills.none": "The job lists no skills, so skills are not part of the score.",
    "skills.required": "Has {found} of {total} required skill{plural}.",
    "skills.preferred": "Has {found} of {total} nice-to-have skill{plural}.",
    "skills.unweighted": (
        "The listed skills carry no weight, so skills are not part of the score."
    ),
    "embedding.missing": "No embedding is available, so similarity of meaning is not scored.",
    "embedding.score": (
        "Similarity of meaning with the job: {score:.0f}/100 "
        "(compared with other candidates, not an absolute grade)."
    ),
    "experience.not_required": "The job gives no minimum experience, so experience is not scored.",
    "experience.zero_required": (
        "The job asks for no prior experience, so experience is not scored."
    ),
    "experience.unknown": (
        "The CV gives no total years of experience, so experience is not scored."
    ),
    "experience.meets": "Has {have} of experience; the job asks for at least {need}.",
    "experience.below": "Has {have} of experience, below the {need} the job asks for.",
    "title.missing": "No job title to compare, so title fit is not scored.",
    # The CV's titles are never quoted: a headline can hold a date of birth or other personal
    # detail that redaction does not catch, and this text is stored and shown.
    "title.score": (
        "Job title fit: {score:.0f}/100, from the closest title in the CV, seniority aside."
    ),
    "text.score": (
        "Shared words with the job: {score:.0f}/100. It counts shared words, not meaning."
    ),
    "advisory": (
        "This score is advisory: it ranks candidates for this job and is not a chance of "
        "passing screening. It can be wrong and does not reject anyone. Read the CV before "
        "you decide."
    ),
}

# The components in the order they are reported: the same as config.COMPONENTS (a test checks).
COMPONENT_NAMES: Final[tuple[ComponentName, ...]] = get_args(ComponentName)

# Short names of the components, as the detail view shows them.
LABELS: Final[Mapping[ComponentName, str]] = {
    "skill_overlap": "Skills",
    "embedding_similarity": "Similarity of meaning",
    "experience_fit": "Experience",
    "title_similarity": "Job title",
    "text_similarity": "Shared words",
}


def band(total: float, bands: BandSettings) -> Band:
    """strong, moderate or weak, from the thresholds in weights.yaml."""
    if total >= bands.strong:
        return "strong"
    if total >= bands.moderate:
        return "moderate"
    return "weak"


def years_or_none(value: object) -> float | None:
    """A number of years as a float, or None when it is missing, not a number or negative."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return float(value)


def _format_years(years: float) -> str:
    return f"{years:g} year{'' if years == 1 else 's'}"


def _count(key: str, found: int, total: int) -> str:
    return TEMPLATES[key].format(found=found, total=total, plural="" if total == 1 else "s")


def skill_lines(skills: SkillMatch) -> list[str]:
    """One sentence for required skills and one for nice-to-have skills, when the job has them.

    Whether the job lists skills is read from the skill lists, not from the overlap: with
    `preferred_weight: 0` a job listing only nice-to-have skills has no overlap, yet its skills
    are listed and can match. That case gets the counts and then a sentence saying so.
    """
    required = len(skills.matched_required) + len(skills.missing_required)
    preferred = len(skills.matched_preferred) + len(skills.missing_preferred)
    if not required and not preferred:
        return [TEMPLATES["skills.none"]]
    lines = []
    if required:
        lines.append(_count("skills.required", len(skills.matched_required), required))
    if preferred:
        lines.append(_count("skills.preferred", len(skills.matched_preferred), preferred))
    if skills.overlap is None:
        lines.append(TEMPLATES["skills.unweighted"])
    return lines


def summary_skill_lines(skills: SkillMatch) -> list[str]:
    """The skills sentences of the summary: the first one, or all of them when the skills
    carry no weight, so the summary never shows a count without saying it is not scored."""
    lines = skill_lines(skills)
    return lines if skills.overlap is None else lines[:1]


def experience_status(candidate_years: object, min_years: object) -> tuple[ExperienceStatus, str]:
    """The experience status and its sentence. Same rule as `scoring.experience_fit`."""
    have, need = years_or_none(candidate_years), years_or_none(min_years)
    if need is None:
        return "not_required", TEMPLATES["experience.not_required"]
    if need == 0:
        return "not_required", TEMPLATES["experience.zero_required"]
    if have is None:
        return "unknown", TEMPLATES["experience.unknown"]
    status: ExperienceStatus = "meets" if have >= need else "below"
    text = TEMPLATES[f"experience.{status}"].format(
        have=_format_years(have), need=_format_years(need)
    )
    return status, text


def component_statements(
    skills: SkillMatch,
    components: ScoreComponents,
    candidate_years: object,
    min_years: object,
) -> dict[ComponentName, str]:
    """The sentence shown with each component."""
    embedding = components["embedding_similarity"]
    title_score = components["title_similarity"]
    return {
        "skill_overlap": " ".join(skill_lines(skills)),
        "embedding_similarity": (
            TEMPLATES["embedding.missing"]
            if embedding is None
            else TEMPLATES["embedding.score"].format(score=embedding)
        ),
        "experience_fit": experience_status(candidate_years, min_years)[1],
        "title_similarity": (
            TEMPLATES["title.missing"]
            if title_score is None
            else TEMPLATES["title.score"].format(score=title_score)
        ),
        "text_similarity": TEMPLATES["text.score"].format(score=components["text_similarity"]),
    }


def _cv_phrases(cv_skills: Sequence[str]) -> dict[str, str]:
    """Each skill of the CV in the scorer's normalized form, mapped to its first spelling."""
    phrases: dict[str, str] = {}
    for raw in cv_skills:
        key = normalize_skill(raw)
        if key:
            phrases.setdefault(key, raw.strip())
    return phrases


def matched_skills(skills: SkillMatch, cv_skills: Sequence[str]) -> list[dict[str, str]]:
    """The matched job skills, each with the phrase of the CV that matched it."""
    phrases = _cv_phrases(cv_skills)
    matched = [(name, "required") for name in skills.matched_required]
    matched += [(name, "preferred") for name in skills.matched_preferred]
    return [
        {"skill": name, "requirement": requirement, "cv_phrase": phrases[normalize_skill(name)]}
        for name, requirement in matched
    ]


def build_explanation(
    *,
    total: float,
    components: ScoreComponents,
    weights: Mapping[str, float],
    skills: SkillMatch,
    cv_skills: Sequence[str],
    candidate_years: object,
    min_years: object,
    bands: BandSettings,
    model_version: str,
) -> dict[str, Any]:
    """The explanation payload, as JSON-ready data valid under `ScoreExplanation`.

    Every argument must come from the redacted CV: `cv_skills` are its skill texts and
    `candidate_years` its total years. `total`, `components` and `weights` are the rounded
    values of the score.
    """
    statements = component_statements(skills, components, candidate_years, min_years)
    status, experience_text = experience_status(candidate_years, min_years)
    level = band(total, bands)

    # Band, then the first skills sentence (required skills when the job lists any), then
    # experience: what a recruiter checks first.
    summary = [TEMPLATES[f"band.{level}"], *summary_skill_lines(skills), experience_text]

    parts = []
    for name in COMPONENT_NAMES:
        value = components[name]
        weight = weights[name]
        parts.append(
            {
                "name": name,
                "label": LABELS[name],
                "score": value,
                "weight": weight,
                "contribution": 0.0 if value is None else round(value * weight, 2),
                "statement": statements[name],
            }
        )

    return {
        "explanation_version": EXPLANATION_VERSION,
        "model_version": model_version,
        "total": total,
        "band": level,
        "summary": " ".join(summary),
        "components": parts,
        "matched_skills": matched_skills(skills, cv_skills),
        "missing_skills": {
            "required": list(skills.missing_required),
            "preferred": list(skills.missing_preferred),
        },
        "experience": {
            "status": status,
            "candidate_years": years_or_none(candidate_years),
            "required_years": years_or_none(min_years),
            "statement": experience_text,
        },
        "advisory_note": TEMPLATES["advisory"],
    }
