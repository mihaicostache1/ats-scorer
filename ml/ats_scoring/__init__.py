"""Candidate-to-job scoring for the ATS platform."""

from ats_scoring.redaction import redact
from ats_scoring.score_explanation import EXPLANATION_VERSION, ScoreExplanation
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
    "EXPLANATION_VERSION",
    "MODEL_VERSION",
    "WEIGHTS",
    "NothingToScoreError",
    "ScoreExplanation",
    "redact",
    "score",
    "score_batch",
]
