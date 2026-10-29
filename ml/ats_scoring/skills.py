"""Skill normalization and keyword overlap between a candidate and a job."""

import re
import unicodedata
from dataclasses import dataclass

# A nice-to-have skill counts half as much as a required one.
PREFERRED_WEIGHT = 0.5

# Abbreviations that plain string comparison cannot resolve. Keys and values are in
# cleaned form. Background: docs/ml/embedding-model-and-skill-matching.md
SKILL_ALIASES = {
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "python3": "python",
    "postgres": "postgresql",
    "k8s": "kubernetes",
    "ml": "machine learning",
    "nlp": "natural language processing",
    "golang": "go",
    "node": "node.js",
    "nodejs": "node.js",
    "reactjs": "react",
    "react.js": "react",
    "aws": "amazon web services",
    "gcp": "google cloud platform",
}


@dataclass(frozen=True)
class SkillMatch:
    """Outcome of comparing a candidate's skills with a job's skills, in the job's spelling."""

    matched_required: list[str]
    missing_required: list[str]
    matched_preferred: list[str]
    missing_preferred: list[str]
    overlap: float | None  # 0-1, or None when the job lists no skills

    @property
    def matched(self) -> list[str]:
        """Job skills the candidate has, required ones first."""
        return self.matched_required + self.matched_preferred

    @property
    def missing(self) -> list[str]:
        """Required job skills the candidate lacks."""
        return self.missing_required


def clean_skill(skill: str) -> str:
    """Unicode-normalized, lower case, single spaces, without list bullets or trailing
    punctuation. Keeps `#`, `+`, `.` and `/`, so `C#`, `C++`, `Node.js` and `CI/CD` stay
    distinct."""
    text = unicodedata.normalize("NFKC", skill).casefold()
    text = re.sub(r"\s+", " ", text).strip()
    return text.lstrip("-*• ").rstrip(".,;: ")


def normalize_skill(skill: str) -> str:
    """Return the form the scorer uses to compare two skills: cleaned, with known
    abbreviations expanded."""
    text = clean_skill(skill)
    return SKILL_ALIASES.get(text, text)


def _unique(skills: object) -> dict[str, str]:
    """Map each normalized skill to its first spelling. Ignores anything that is not text."""
    unique: dict[str, str] = {}
    if isinstance(skills, list | tuple):
        for skill in skills:
            if isinstance(skill, str) and normalize_skill(skill):
                unique.setdefault(normalize_skill(skill), skill.strip())
    return unique


def match_skills(candidate_skills: object, required: object, preferred: object) -> SkillMatch:
    """Compare skill lists after normalization.

    The overlap is the share of the job's skills the candidate has, with preferred
    skills weighted by PREFERRED_WEIGHT. A skill listed as both required and preferred
    counts as required.
    """
    have = _unique(candidate_skills).keys()
    wanted = _unique(required)
    optional = {key: name for key, name in _unique(preferred).items() if key not in wanted}

    matched_required = [name for key, name in wanted.items() if key in have]
    matched_optional = [name for key, name in optional.items() if key in have]
    possible = len(wanted) + PREFERRED_WEIGHT * len(optional)
    earned = len(matched_required) + PREFERRED_WEIGHT * len(matched_optional)
    return SkillMatch(
        matched_required=matched_required,
        missing_required=[name for key, name in wanted.items() if key not in have],
        matched_preferred=matched_optional,
        missing_preferred=[name for key, name in optional.items() if key not in have],
        overlap=earned / possible if possible else None,
    )
