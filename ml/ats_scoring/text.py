"""Text taken from a parsed CV or a job, and the TF-IDF similarity between the two."""

import re
from collections.abc import Mapping
from typing import Any

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

# A word, optionally followed by +/# (c++, c#) or by more words joined with . / - (node.js, ci/cd).
_TOKEN = re.compile(r"[^\W_]+(?:[+#]+|(?:[./-][^\W_]+)+)?")


def tokenize(text: str) -> list[str]:
    """Split text into lower-case tokens and drop English stop words."""
    return [token for token in _TOKEN.findall(text.casefold()) if token not in ENGLISH_STOP_WORDS]


def _strings(value: object) -> list[str]:
    """Return the non-empty strings of a JSON list, or nothing if the value is not a list."""
    if not isinstance(value, list | tuple):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _mappings(value: object) -> list[Mapping[str, Any]]:
    if not isinstance(value, list | tuple):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def skill_texts(value: object) -> list[str]:
    """The skills of a parsed CV as text, from either shape.

    Schema 1.0 lists `{"raw", "normalized"}` objects. The draft 0.1 lists plain strings.
    The scorer compares what was written in the CV, so it takes `raw`.
    """
    if not isinstance(value, list | tuple):
        return []
    texts = [item.get("raw") if isinstance(item, Mapping) else item for item in value]
    return [text for text in texts if isinstance(text, str) and text.strip()]


def _join(parts: list[Any]) -> str:
    return "\n".join(part.strip() for part in parts if isinstance(part, str) and part.strip())


def candidate_text(candidate: Mapping[str, Any]) -> str:
    """Build the text the scorer reads from a parsed CV.

    Only qualifications are used: headline, summary, skills, job titles and what was done
    in each job, degrees and certifications. Contact details, employer and school names,
    dates, graduation years, languages, confidence and every other field are left out on
    purpose (user story US-06). Reads schema 1.0 (`experiences`) and the draft 0.1
    (`work_history`).
    """
    parts: list[Any] = [candidate.get("headline"), candidate.get("summary")]
    parts += skill_texts(candidate.get("skills"))
    positions = candidate.get("experiences", candidate.get("work_history"))
    for position in _mappings(positions):
        parts += [position.get("title"), position.get("summary")]
        parts += _strings(position.get("bullets"))
    parts += [entry.get("degree") for entry in _mappings(candidate.get("education"))]
    parts += _strings(candidate.get("certifications"))
    return _join(parts)


def job_text(job: Mapping[str, Any]) -> str:
    """Build the text the scorer reads from a job: title, description and skill lists."""
    parts: list[Any] = [job.get("title"), job.get("description")]
    parts += _strings(job.get("required_skills"))
    parts += _strings(job.get("preferred_skills"))
    return _join(parts)


def tfidf_similarity(first: str, second: str) -> float:
    """Return the cosine similarity (0-1) of two texts under TF-IDF.

    Uses single words and word pairs. The IDF is computed from these two texts only,
    which is weak: a word found in both counts a little less than a word found in one.
    Fitting the IDF on a larger set of CVs and jobs is the natural next step.
    """
    if not tokenize(first) or not tokenize(second):
        return 0.0
    vectorizer = TfidfVectorizer(
        tokenizer=tokenize,
        token_pattern=None,
        lowercase=False,
        ngram_range=(1, 2),
        sublinear_tf=True,
    )
    # Rows are unit length, so their dot product is the cosine similarity.
    matrix = vectorizer.fit_transform([first, second])
    similarity = float(matrix[0].multiply(matrix[1]).sum())
    return min(1.0, max(0.0, similarity))
