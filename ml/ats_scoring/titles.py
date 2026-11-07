"""Similarity between the job's title and the titles a candidate has held.

Seniority words (junior, senior, lead, head of, ...) are removed first: how much experience
a candidate has is scored separately, by the experience fit. What is left is the field and
the role ("backend engineer", "data analyst"), compared word by word.
"""

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

# Words that say how senior a role is, not what the role is.
SENIORITY_WORDS = frozenset(
    {
        "junior", "jr", "senior", "sr", "mid", "medior", "intermediate", "lead", "head",
        "principal", "staff", "chief", "associate", "assistant", "intern", "trainee",
        "graduate", "entry", "level", "i", "ii", "iii", "iv",
    }
)  # fmt: skip

# Words that carry no meaning in a title.
FILLER_WORDS = frozenset({"of", "and", "the", "for", "in", "a", "an", "to"})

# Spellings of the same thing. Keys and values are cleaned, single words.
TITLE_SYNONYMS = {
    "developer": "engineer",
    "dev": "engineer",
    "programmer": "engineer",
    "back-end": "backend",
    "front-end": "frontend",
    "full-stack": "fullstack",
    "analytics": "analyst",
    "analysis": "analyst",
    "marketer": "marketing",
    "ux/ui": "ux",
    "ui/ux": "ux",
}

# Words that say the kind of job but not the field ("engineer" in "backend engineer"). They
# count half, so "Backend Engineer" and "Frontend Engineer" are not seen as close.
GENERIC_WORDS = frozenset(
    {"engineer", "specialist", "manager", "consultant", "officer", "coordinator", "executive"}
)
GENERIC_WEIGHT = 0.5

_WORD = re.compile(r"[^\W_]+(?:[-/][^\W_]+)*")


def title_words(title: str) -> dict[str, float]:
    """The words of a title that describe the role, each with its weight."""
    text = unicodedata.normalize("NFKC", title).casefold()
    words: dict[str, float] = {}
    for word in _WORD.findall(text):
        word = TITLE_SYNONYMS.get(word, word)
        if word in SENIORITY_WORDS or word in FILLER_WORDS:
            continue
        words[word] = GENERIC_WEIGHT if word in GENERIC_WORDS else 1.0
    return words


def title_similarity(first: str, second: str) -> float:
    """Weighted Dice similarity of the role words of two titles, from 0 to 1."""
    a, b = title_words(first), title_words(second)
    total = sum(a.values()) + sum(b.values())
    if not total:
        return 0.0
    shared = sum(weight for word, weight in a.items() if word in b)
    return 2 * shared / total


@dataclass(frozen=True)
class TitleMatch:
    similarity: float | None  # 0-1, or None when the job or the candidate has no title
    closest_title: str | None


def candidate_titles(candidate: Mapping[str, Any]) -> list[str]:
    """Headline first, then the position titles, most recent first."""
    titles = [candidate.get("headline")]
    positions = candidate.get("experiences", candidate.get("work_history"))
    if isinstance(positions, list | tuple):
        titles += [item.get("title") for item in positions if isinstance(item, Mapping)]
    return [title.strip() for title in titles if isinstance(title, str) and title.strip()]


def match_title(
    candidate: Mapping[str, Any], job_title: object, older_title_factor: float
) -> TitleMatch:
    """Best similarity between the job title and any title the candidate has held.

    The headline and the most recent position count in full; older positions are multiplied
    by `older_title_factor`, so a field the candidate left long ago counts less.
    """
    if not isinstance(job_title, str) or not title_words(job_title):
        return TitleMatch(None, None)
    has_headline = isinstance(candidate.get("headline"), str) and candidate["headline"].strip()
    full_weight = 2 if has_headline else 1
    best, closest = None, None
    for index, title in enumerate(candidate_titles(candidate)):
        if not title_words(title):
            continue
        factor = 1.0 if index < full_weight else older_title_factor
        value = factor * title_similarity(job_title, title)
        if best is None or value > best:
            best, closest = value, title
    return TitleMatch(best, closest)
