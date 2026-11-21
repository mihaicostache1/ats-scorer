"""Tests for score_batch: many candidates against one job, each scored exactly as score() does."""

import json
import math
import socket
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from ats_scoring import NothingToScoreError, score, score_batch
from ats_scoring.config import DEFAULT_CONFIG

EVAL_DATA = Path(__file__).resolve().parents[1] / "evaluation" / "data"


def vector(cosine: float) -> list[float]:
    """A unit vector whose cosine with JOB_VECTOR is `cosine`."""
    values = [0.0] * DEFAULT_CONFIG.embedding.dimensions
    values[0] = cosine
    values[1] = math.sqrt(1 - cosine**2)
    return values


JOB: dict[str, Any] = {
    "title": "Backend Developer",
    "description": "Build and maintain REST services in Python with PostgreSQL.",
    "required_skills": ["Python", "PostgreSQL", "Docker", "REST APIs"],
    "preferred_skills": ["Redis", "Kafka"],
    "min_experience_years": 3,
}
JOB_VECTOR = vector(1.0)

IDENTICAL: dict[str, Any] = {  # says exactly what the job says
    "headline": "Backend Developer",
    "summary": "Build and maintain REST services in Python with PostgreSQL.",
    "skills": ["Python", "PostgreSQL", "Docker", "REST APIs", "Redis", "Kafka"],
    "experience_years": 5,
}
PARTIAL: dict[str, Any] = {  # same field, half the required skills, less experience
    "headline": "Backend Developer",
    "summary": "Builds REST services in Python.",
    "skills": ["python", "Postgres", "Git"],
    "experience_years": 1.5,
}
UNRELATED: dict[str, Any] = {  # shares no skill, word or title with the job
    "headline": "Pastry Chef",
    "summary": "Bakes croissants, tarts and sourdough bread every morning.",
    "skills": ["Baking", "Cake Decorating", "Food Safety"],
}

CANDIDATES = [IDENTICAL, PARTIAL, UNRELATED]
VECTORS = [vector(1.0), vector(0.88), vector(0.7)]
EMPTY_CV: dict[str, Any] = {"full_name": "Nobody", "skills": []}  # nothing left to score


def one_by_one(
    candidates: list[dict[str, Any]], vectors: list[Any] | None, job_vector: Any
) -> list[Any]:
    """What calling score() for each candidate gives, with None where it raises."""
    results: list[Any] = []
    for index, candidate in enumerate(candidates):
        try:
            results.append(
                score(
                    candidate,
                    JOB,
                    candidate_embedding=None if vectors is None else vectors[index],
                    job_embedding=job_vector,
                )
            )
        except NothingToScoreError:
            results.append(None)
    return results


def test_results_equal_score_for_each_candidate() -> None:
    batch = score_batch(JOB, CANDIDATES, candidate_embeddings=VECTORS, job_embedding=JOB_VECTOR)

    assert batch == one_by_one(CANDIDATES, VECTORS, JOB_VECTOR)
    totals = [result["total"] for result in batch if result is not None]
    assert totals[0] == 100.0 > totals[1] > totals[2] == 0.0


def test_results_equal_score_without_embeddings() -> None:
    assert score_batch(JOB, CANDIDATES) == one_by_one(CANDIDATES, None, None)


def test_results_equal_score_on_the_evaluation_set() -> None:
    """All 6 jobs against all 45 CVs, with the real e5 embeddings: 270 pairs."""
    embeddings = json.loads((EVAL_DATA / "embeddings.json").read_text(encoding="utf-8"))
    paths = sorted((EVAL_DATA / "candidates").glob("*.json"))
    candidates = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    vectors = [embeddings["candidates"][path.stem] for path in paths]

    for job_path in sorted((EVAL_DATA / "jobs").glob("*.json")):
        job = json.loads(job_path.read_text(encoding="utf-8"))
        job_vector = embeddings["jobs"][job_path.stem]
        batch = score_batch(job, candidates, candidate_embeddings=vectors, job_embedding=job_vector)
        expected = [
            score(candidate, job, candidate_embedding=vector, job_embedding=job_vector)
            for candidate, vector in zip(candidates, vectors, strict=True)
        ]
        assert batch == expected, job_path.stem


@pytest.mark.parametrize("dtype", [np.float64, np.float32])
def test_embeddings_as_a_matrix_or_arrays_give_the_same_results(dtype: type) -> None:
    matrix: np.ndarray = np.array(VECTORS, dtype=dtype)
    expected = one_by_one(CANDIDATES, list(matrix), np.asarray(JOB_VECTOR, dtype=dtype))

    as_matrix = score_batch(JOB, CANDIDATES, candidate_embeddings=matrix, job_embedding=JOB_VECTOR)
    as_arrays = score_batch(
        JOB, CANDIDATES, candidate_embeddings=list(matrix), job_embedding=JOB_VECTOR
    )

    assert as_matrix == as_arrays == expected


def test_a_candidate_without_an_embedding_is_scored_without_it() -> None:
    vectors = [VECTORS[0], None, VECTORS[2]]
    batch = score_batch(JOB, CANDIDATES, candidate_embeddings=vectors, job_embedding=JOB_VECTOR)

    assert batch == one_by_one(CANDIDATES, vectors, JOB_VECTOR)
    assert batch[1] is not None
    assert batch[1]["components"]["embedding_similarity"] is None


def test_a_candidate_with_nothing_to_score_gets_none_and_the_rest_are_scored() -> None:
    candidates = [PARTIAL, EMPTY_CV, IDENTICAL]

    batch = score_batch(JOB, candidates)

    assert batch[1] is None
    assert batch[0] == score(PARTIAL, JOB)
    assert batch[2] == score(IDENTICAL, JOB)


def test_a_job_with_nothing_to_score_raises() -> None:
    with pytest.raises(NothingToScoreError):
        score_batch({"title": " ", "required_skills": []}, CANDIDATES)


def test_no_candidates_gives_an_empty_list() -> None:
    assert score_batch(JOB, [], candidate_embeddings=[], job_embedding=JOB_VECTOR) == []


def test_embeddings_must_line_up_with_the_candidates() -> None:
    with pytest.raises(ValueError, match="2 entries for 3 candidates"):
        score_batch(JOB, CANDIDATES, candidate_embeddings=VECTORS[:2], job_embedding=JOB_VECTOR)


def test_an_embedding_of_the_wrong_length_names_its_position() -> None:
    vectors = [VECTORS[0], VECTORS[1][:10], VECTORS[2]]
    with pytest.raises(ValueError, match=r"candidate_embeddings\[1\]"):
        score_batch(JOB, CANDIDATES, candidate_embeddings=vectors, job_embedding=JOB_VECTOR)
    with pytest.raises(ValueError, match="job_embedding"):
        score_batch(JOB, CANDIDATES, candidate_embeddings=VECTORS, job_embedding=[0.1, 0.2])


def test_a_result_does_not_depend_on_the_rest_of_the_batch() -> None:
    forward = score_batch(JOB, CANDIDATES, candidate_embeddings=VECTORS, job_embedding=JOB_VECTOR)
    backward = score_batch(
        JOB, CANDIDATES[::-1], candidate_embeddings=VECTORS[::-1], job_embedding=JOB_VECTOR
    )
    alone = score_batch(JOB, [PARTIAL], candidate_embeddings=[VECTORS[1]], job_embedding=JOB_VECTOR)

    assert backward == forward[::-1]
    assert alone == [forward[1]]


def test_score_batch_is_repeatable_and_leaves_its_inputs_alone() -> None:
    candidates = json.loads(json.dumps(CANDIDATES))
    job = json.loads(json.dumps(JOB))

    first = score_batch(job, candidates, candidate_embeddings=VECTORS, job_embedding=JOB_VECTOR)
    second = score_batch(job, candidates, candidate_embeddings=VECTORS, job_embedding=JOB_VECTOR)

    assert first == second
    assert candidates == CANDIDATES
    assert job == JOB


def test_score_batch_makes_no_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("score_batch() tried to open a network connection")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)

    batch = score_batch(JOB, CANDIDATES, candidate_embeddings=VECTORS, job_embedding=JOB_VECTOR)
    assert all(result is not None for result in batch)


NAMED: dict[str, Any] = {  # the CV still uses the name the candidate had before marriage
    "contact": {"name": "Ana Pop"},
    "headline": "Backend Developer",
    "summary": "Maria Ionescu builds REST services in Python.",
    "skills": ["Python", "Docker"],
    "experience_years": 4,
}
UNNAMED = {**NAMED, "summary": "builds REST services in Python."}


def test_additional_names_are_removed_before_scoring() -> None:
    """A name the CV's contact block does not give must not count, as in the B-17 embedding."""
    plain = score_batch(JOB, [NAMED])
    named = score_batch(JOB, [NAMED], additional_names=[["Maria Ionescu"]])

    assert named == [score(UNNAMED, JOB)] != plain
    assert named == [score(NAMED, JOB, additional_names=["Maria Ionescu"])]


def test_additional_names_line_up_with_the_candidates() -> None:
    names = [["Maria Ionescu"], None, "Maria Ionescu"]  # a plain string is one name
    batch = score_batch(JOB, [NAMED, PARTIAL, NAMED], additional_names=names)

    assert batch == [score(UNNAMED, JOB), score(PARTIAL, JOB), score(UNNAMED, JOB)]
    with pytest.raises(ValueError, match="additional_names has 1 entries for 3 candidates"):
        score_batch(JOB, CANDIDATES, additional_names=[["Ana Pop"]])
    with pytest.raises(TypeError, match="single string"):
        score_batch(JOB, CANDIDATES, additional_names="Ana Pop")


def test_embedding_model_version_matches_the_backend_format() -> None:
    from ats_scoring import EMBEDDING_MODEL_VERSION

    settings = DEFAULT_CONFIG.embedding
    assert EMBEDDING_MODEL_VERSION == f"{settings.model}@{settings.revision}"
