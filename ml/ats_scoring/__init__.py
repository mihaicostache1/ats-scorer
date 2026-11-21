"""Candidate-to-job scoring for the ATS platform."""

from ats_scoring.redaction import redact
from ats_scoring.scoring import (
    EMBEDDING_MODEL_VERSION,
    MODEL_VERSION,
    WEIGHTS,
    NothingToScoreError,
    score,
    score_batch,
)

__all__ = [
    "EMBEDDING_MODEL_VERSION",
    "MODEL_VERSION",
    "WEIGHTS",
    "NothingToScoreError",
    "redact",
    "score",
    "score_batch",
]
