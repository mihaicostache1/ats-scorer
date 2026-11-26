"""The scorer's model_version (L-21): everything that decides a score, as one stable string.

    hybrid-1.2.0+w.1a2b3c4d.e.5e6f7a8b.t.9c0d1e2f
    └─scorer───┘ └weights─┘ └embedding┘ └taxonomy┘

- scorer: `scorer_version` in weights.yaml, the algorithm. Bumped by hand when a code change can
  move a score (tests/test_scorer_regression.py shows when one did).
- w: every setting in weights.yaml besides those two names: component weights, skill weights,
  embedding dimensions and cosine range, title factor, bands. Read after parsing, so comments,
  key order and 70 versus 70.0 do not count.
- e: the embedding model and its revision.
- t: the vocabularies the scorer matches with: skill aliases and the title words.

The three hashes are computed, so a settings change can never keep the old version by mistake.
Each is the first 8 hex digits of a SHA-256, and the whole string fits `scores.model_version`
(VARCHAR(50)). The rules for when scores are recomputed: docs/ml/model-versioning.md
"""

import dataclasses
import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from ats_scoring.config import DEFAULT_CONFIG, ScorerConfig
from ats_scoring.skills import SKILL_ALIASES
from ats_scoring.titles import FILLER_WORDS, GENERIC_WORDS, SENIORITY_WORDS, TITLE_SYNONYMS

# Length of `scores.model_version` in the database.
MAX_LENGTH = 50
HASH_LENGTH = 8

_HASH = rf"[0-9a-f]{{{HASH_LENGTH}}}"
_PATTERN = re.compile(
    rf"(?P<scorer>[^+]+)\+w\.(?P<w>{_HASH})\.e\.(?P<e>{_HASH})\.t\.(?P<t>{_HASH})"
)


@dataclass(frozen=True)
class ModelVersion:
    """The four parts of a model_version. str() gives the string stored with a score."""

    scorer: str
    weights: str
    embedding: str
    taxonomy: str

    def __str__(self) -> str:
        return f"{self.scorer}+w.{self.weights}.e.{self.embedding}.t.{self.taxonomy}"

    def changed(self, other: "ModelVersion") -> list[str]:
        """The names of the parts that differ from `other`, in order."""
        return [
            field.name
            for field in dataclasses.fields(self)
            if getattr(self, field.name) != getattr(other, field.name)
        ]


def _hash(value: Any) -> str:
    text = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:HASH_LENGTH]


def _settings(config: ScorerConfig) -> dict[str, Any]:
    """Every setting of `config` except the scorer version and the embedding model's name.

    Taken from the dataclass, so a setting added to ScorerConfig counts without a change here.
    """
    settings = dataclasses.asdict(config)
    del settings["scorer_version"]
    del settings["embedding"]["model"], settings["embedding"]["revision"]
    return settings


def taxonomy() -> dict[str, Any]:
    """The vocabularies the scorer matches skills and titles with."""
    return {
        "skill_aliases": SKILL_ALIASES,
        "title_synonyms": TITLE_SYNONYMS,
        "seniority_words": sorted(SENIORITY_WORDS),
        "filler_words": sorted(FILLER_WORDS),
        "generic_words": sorted(GENERIC_WORDS),
    }


def model_version_parts(config: ScorerConfig = DEFAULT_CONFIG) -> ModelVersion:
    """The model_version of `config`, part by part."""
    embedding = config.embedding
    return ModelVersion(
        scorer=config.scorer_version,
        weights=_hash(_settings(config)),
        embedding=_hash(f"{embedding.model}@{embedding.revision}"),
        taxonomy=_hash(taxonomy()),
    )


def get_model_version(config: ScorerConfig = DEFAULT_CONFIG) -> str:
    """The string stored with every score: the same for the same scorer, settings, embedding
    model and vocabularies, on any machine and Python version, and different when one changes.

    Raises ValueError if it does not fit `scores.model_version`.
    """
    version = str(model_version_parts(config))
    if len(version) > MAX_LENGTH:
        raise ValueError(
            f"model_version {version!r} is longer than {MAX_LENGTH} characters: "
            "shorten scorer_version in weights.yaml"
        )
    return version


def parse_model_version(text: str) -> ModelVersion | None:
    """The parts of a stored model_version, or None for one made before L-21 (no hashes)."""
    match = _PATTERN.fullmatch(text)
    if match is None:
        return None
    return ModelVersion(
        scorer=match["scorer"], weights=match["w"], embedding=match["e"], taxonomy=match["t"]
    )
