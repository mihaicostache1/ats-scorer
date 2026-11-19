"""Tests for the hybrid scorer."""

import dataclasses
import math
import socket
from typing import Any

import numpy as np
import pytest

from ats_scoring import MODEL_VERSION, WEIGHTS, NothingToScoreError, score
from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG
from ats_scoring.scoring import embedding_similarity, experience_fit

DIMENSIONS = DEFAULT_CONFIG.embedding.dimensions
FLOOR = DEFAULT_CONFIG.embedding.cosine_floor
CEILING = DEFAULT_CONFIG.embedding.cosine_ceiling


def vector(cosine: float) -> list[float]:
    """A unit vector whose cosine with JOB_VECTOR is `cosine`."""
    values = [0.0] * DIMENSIONS
    values[0] = cosine
    values[1] = math.sqrt(1 - cosine**2)
    return values


JOB_VECTOR = vector(1.0)

JOB = {
    "title": "Backend Developer",
    "description": "Build and maintain REST services in Python with PostgreSQL.",
    "required_skills": ["Python", "PostgreSQL", "Docker", "REST APIs"],
    "preferred_skills": ["Redis", "Kafka"],
    "min_experience_years": 3,
}

# Says exactly what the job says, so it is the best possible match.
IDENTICAL = {
    "headline": "Backend Developer",
    "summary": "Build and maintain REST services in Python with PostgreSQL.",
    "skills": ["Python", "PostgreSQL", "Docker", "REST APIs", "Redis", "Kafka"],
    "experience_years": 5,
}

# Same field, half of the required skills, written differently, less experience.
PARTIAL = {
    "headline": "Backend Developer",
    "summary": "Builds REST services in Python.",
    "skills": ["python", "Postgres", "Git"],
    "experience_years": 1.5,
}

# Shares no skill, no word and no title with the job.
UNRELATED = {
    "headline": "Pastry Chef",
    "summary": "Bakes croissants, tarts and sourdough bread every morning.",
    "skills": ["Baking", "Cake Decorating", "Food Safety"],
}

EMBEDDINGS = {"IDENTICAL": vector(1.0), "PARTIAL": vector(0.88), "UNRELATED": vector(0.7)}


def full_score(candidate: dict[str, Any], name: str, job: dict[str, Any] = JOB) -> Any:
    return score(candidate, job, candidate_embedding=EMBEDDINGS[name], job_embedding=JOB_VECTOR)


# --------------------------------------------------------------------------- whole score


def test_model_version_comes_from_weights_yaml_and_is_bumped() -> None:
    assert MODEL_VERSION == DEFAULT_CONFIG.model_version
    assert MODEL_VERSION != "tfidf-skills-0.1.0"
    assert WEIGHTS == dict(DEFAULT_CONFIG.weights)


def test_identical_pair_scores_100() -> None:
    result = full_score(IDENTICAL, "IDENTICAL")

    assert result["total"] == 100.0
    assert result["components"] == dict.fromkeys(COMPONENTS, 100.0)
    assert result["matched_skills"] == IDENTICAL["skills"]
    assert result["missing_skills"] == []


def test_unrelated_pair_scores_0() -> None:
    result = full_score(UNRELATED, "UNRELATED")

    assert result["total"] == 0.0
    assert result["components"] == {
        "skill_overlap": 0.0,
        "embedding_similarity": 0.0,
        "experience_fit": None,  # the CV gives no years
        "title_similarity": 0.0,
        "text_similarity": 0.0,
    }
    assert result["matched_skills"] == []
    assert result["missing_skills"] == ["Python", "PostgreSQL", "Docker", "REST APIs"]


def test_partial_pair_scores_in_between() -> None:
    result = full_score(PARTIAL, "PARTIAL")
    components = result["components"]

    # 2 of 4 required skills and 0 of 2 preferred ones: 2 / (4 + 0.5 * 2) = 40%.
    assert components["skill_overlap"] == 40.0
    assert components["embedding_similarity"] == pytest.approx(
        100 * (0.88 - FLOOR) / (CEILING - FLOOR), abs=0.01
    )
    assert components["experience_fit"] == 50.0  # 1.5 of 3 years
    assert components["title_similarity"] == 100.0
    assert 0 < components["text_similarity"] < 100
    assert 0 < result["total"] < 100
    assert result["matched_skills"] == ["Python", "PostgreSQL"]
    assert result["missing_skills"] == ["Docker", "REST APIs"]


def test_better_matches_score_higher() -> None:
    totals = [
        full_score(candidate, name)["total"]
        for name, candidate in (
            ("IDENTICAL", IDENTICAL),
            ("PARTIAL", PARTIAL),
            ("UNRELATED", UNRELATED),
        )
    ]

    assert totals == sorted(totals, reverse=True)
    assert len(set(totals)) == 3


@pytest.mark.parametrize(
    ("name", "candidate"),
    [("IDENTICAL", IDENTICAL), ("PARTIAL", PARTIAL), ("UNRELATED", UNRELATED)],
)
def test_result_has_the_agreed_shape_and_range(name: str, candidate: dict[str, Any]) -> None:
    result = full_score(candidate, name)

    assert set(result) == {
        "total",
        "components",
        "weights",
        "matched_skills",
        "missing_skills",
        "score_explanations",
        "model_version",
    }
    assert list(result["components"]) == list(COMPONENTS)
    assert list(result["weights"]) == list(COMPONENTS)
    assert result["model_version"] == MODEL_VERSION
    assert sum(result["weights"].values()) == pytest.approx(1.0, abs=1e-3)
    assert 0 <= result["total"] <= 100
    for value in result["components"].values():
        assert value is None or 0 <= value <= 100


def test_all_components_present_uses_the_configured_weights() -> None:
    assert full_score(PARTIAL, "PARTIAL")["weights"] == WEIGHTS


def test_total_is_the_weighted_mix_of_the_components() -> None:
    result = full_score(PARTIAL, "PARTIAL")

    expected = sum(
        result["weights"][name] * (result["components"][name] or 0) for name in COMPONENTS
    )
    assert result["total"] == pytest.approx(expected, abs=0.05)


def test_missing_component_spreads_its_weight_over_the_others() -> None:
    result = score(PARTIAL, JOB)  # no embeddings

    weights = result["weights"]
    assert result["components"]["embedding_similarity"] is None
    assert weights["embedding_similarity"] == 0.0
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)
    rest = 1 - WEIGHTS["embedding_similarity"]
    for name in COMPONENTS:
        if name != "embedding_similarity":
            assert weights[name] == pytest.approx(WEIGHTS[name] / rest, abs=1e-4)


def test_job_without_skills_is_scored_without_the_skill_component() -> None:
    job = {"title": JOB["title"], "description": JOB["description"]}

    result = score(PARTIAL, job)

    assert result["components"]["skill_overlap"] is None
    assert result["components"]["experience_fit"] is None  # the job gives no minimum
    assert result["weights"]["skill_overlap"] == 0.0
    assert result["matched_skills"] == []
    assert result["missing_skills"] == []
    assert result["score_explanations"][0].startswith("The job lists no skills")


def test_only_text_left_gives_text_alone() -> None:
    job = {"description": JOB["description"]}  # no title, skills or years

    result = score({"summary": "Builds REST services in Python."}, job)

    assert result["weights"]["text_similarity"] == 1.0
    assert result["total"] == result["components"]["text_similarity"]


def test_a_required_skill_counts_more_than_a_preferred_one() -> None:
    has_required = {"skills": ["Python"]}
    has_preferred = {"skills": ["Redis"]}

    required = score(has_required, JOB)["components"]["skill_overlap"]
    preferred = score(has_preferred, JOB)["components"]["skill_overlap"]

    assert required == 20.0  # 1 / (4 + 0.5 * 2)
    assert preferred == 10.0  # 0.5 / 5
    assert required > preferred


def test_other_settings_can_be_passed_in() -> None:
    text_only = dataclasses.replace(
        DEFAULT_CONFIG,
        model_version="test-0",
        weights={name: float(name == "text_similarity") for name in COMPONENTS},
    )

    result = full_score(PARTIAL, "PARTIAL")
    other = score(
        PARTIAL,
        JOB,
        candidate_embedding=EMBEDDINGS["PARTIAL"],
        job_embedding=JOB_VECTOR,
        config=text_only,
    )

    assert other["model_version"] == "test-0"
    assert other["total"] == other["components"]["text_similarity"]
    assert other["components"] == result["components"]


# --------------------------------------------------------------------------- embedding


def test_embedding_cosine_is_rescaled_between_floor_and_ceiling() -> None:
    assert embedding_similarity(vector(CEILING), JOB_VECTOR) == pytest.approx(1.0)
    assert embedding_similarity(vector(FLOOR), JOB_VECTOR) == pytest.approx(0.0)
    middle = (FLOOR + CEILING) / 2
    assert embedding_similarity(vector(middle), JOB_VECTOR) == pytest.approx(0.5)
    assert embedding_similarity(vector(0.1), JOB_VECTOR) == 0.0
    assert embedding_similarity(vector(1.0), JOB_VECTOR) == 1.0


def test_embeddings_need_not_be_unit_length_and_may_be_numpy() -> None:
    longer = np.asarray(vector(0.9)) * 7.5

    assert embedding_similarity(longer, JOB_VECTOR) == pytest.approx(
        embedding_similarity(vector(0.9), JOB_VECTOR)
    )


def test_one_missing_embedding_drops_the_component() -> None:
    result = score(PARTIAL, JOB, candidate_embedding=EMBEDDINGS["PARTIAL"])

    assert result["components"]["embedding_similarity"] is None
    assert any("No embedding" in line for line in result["score_explanations"])


def test_all_zero_embedding_drops_the_component() -> None:
    assert embedding_similarity([0.0] * DIMENSIONS, JOB_VECTOR) is None


@pytest.mark.parametrize(
    "bad",
    [[0.1] * (DIMENSIONS - 1), [[0.1] * DIMENSIONS], [math.nan] + [0.1] * (DIMENSIONS - 1)],
)
def test_malformed_embedding_is_an_error(bad: Any) -> None:
    with pytest.raises(ValueError, match="candidate_embedding"):
        score(PARTIAL, JOB, candidate_embedding=bad, job_embedding=JOB_VECTOR)


# --------------------------------------------------------------------------- experience


@pytest.mark.parametrize(
    ("have", "need", "expected"),
    [
        (5, 3, 1.0),
        (3, 3, 1.0),
        (1.5, 3, 0.5),
        (0, 3, 0.0),
        (0, 0, None),  # no requirement: not scored
        (7, 0, None),
        (20, 2, 1.0),  # more experience than asked is not penalized
        (None, 3, None),
        (4, None, None),
        (True, 3, None),
        (-1, 3, None),
        ("5", 3, None),
    ],
)
def test_experience_fit(have: object, need: object, expected: float | None) -> None:
    assert experience_fit(have, need) == expected


def test_a_job_asking_for_no_experience_does_not_score_it() -> None:
    result = score(PARTIAL, {**JOB, "min_experience_years": 0})

    assert result["components"]["experience_fit"] is None
    assert result["weights"]["experience_fit"] == 0.0
    assert (
        "The job asks for no prior experience, so experience is not scored."
        in (result["score_explanations"])
    )


def test_experience_is_explained() -> None:
    lines = full_score(PARTIAL, "PARTIAL")["score_explanations"]

    assert "Has 1.5 years of experience, below the 3 years the job asks for." in lines


# --------------------------------------------------------------------------- title


def test_seniority_words_do_not_change_the_title_fit() -> None:
    job = {**JOB, "title": "Senior Backend Engineer"}

    result = score(PARTIAL, job)  # headline "Backend Developer"

    assert result["components"]["title_similarity"] == 100.0
    assert any(
        "Closest job title: Backend Developer" in line for line in result["score_explanations"]
    )


def test_older_titles_count_less() -> None:
    current = {"headline": "Backend Developer", "skills": ["Git"]}
    earlier = {
        "headline": "Data Analyst",
        "skills": ["Git"],
        "experiences": [
            {"title": "Data Analyst"},
            {"title": "Junior Data Analyst"},
            {"title": "Backend Developer"},
        ],
    }

    assert score(current, JOB)["components"]["title_similarity"] == 100.0
    assert score(earlier, JOB)["components"]["title_similarity"] == pytest.approx(
        100 * DEFAULT_CONFIG.older_title_factor
    )


# --------------------------------------------------------------------------- explanations


def test_partial_pair_is_explained() -> None:
    explanations = full_score(PARTIAL, "PARTIAL")["score_explanations"]

    assert explanations[:2] == ["Has 2 of 4 required skills.", "Has 0 of 2 preferred skills."]
    assert explanations[2].startswith("Similarity of meaning with the job: ")
    assert explanations[3].startswith("Has 1.5 years of experience")
    assert explanations[4].startswith("Closest job title: ")
    assert explanations[5].startswith("Shared words with the job: ")
    assert len(explanations) == 6


def test_explanations_use_the_singular_for_one_skill() -> None:
    job = {"title": "Data Analyst", "required_skills": ["SQL"], "min_experience_years": 1}

    explanations = score({"skills": ["SQL"], "experience_years": 1}, job)["score_explanations"]

    assert explanations[0] == "Has 1 of 1 required skill."
    assert "Has 1 year of experience; the job asks for at least 1 year." in explanations


# --------------------------------------------------------------------------- guarantees


def test_scoring_is_repeatable() -> None:
    assert full_score(PARTIAL, "PARTIAL") == full_score(PARTIAL, "PARTIAL")


def test_scoring_makes_no_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("score() tried to open a network connection")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)

    assert full_score(PARTIAL, "PARTIAL")["total"] > 0


def test_identity_details_do_not_change_the_score() -> None:
    plain = {**PARTIAL, "education": [{"degree": "B.Sc. Computer Science"}]}
    with_identity = {
        **plain,
        "full_name": "Maria Ionescu",
        "email": "maria.ionescu@example.com",
        "date_of_birth": "1994-03-14",
        "nationality": "Romanian",
        "education": [
            {
                "degree": "B.Sc. Computer Science",
                "institution": "Lakeshore University",
                "grad_year": 2016,
            }
        ],
    }

    assert full_score(with_identity, "PARTIAL") == full_score(plain, "PARTIAL")


def test_work_history_counts_towards_the_score() -> None:
    without_history = {"headline": "Developer", "skills": ["Git"]}
    with_history = {
        **without_history,
        "work_history": [
            {
                "title": "Backend Developer",
                "company": "Nimbuscraft Labs",
                "bullets": ["Built REST services in Python with PostgreSQL"],
            }
        ],
    }

    assert score(with_history, JOB)["total"] > score(without_history, JOB)["total"]


def test_missing_and_null_fields_are_tolerated() -> None:
    candidate = {"summary": "Builds REST services in Python.", "skills": None, "work_history": None}

    result = score(candidate, JOB)

    assert result["matched_skills"] == []
    assert result["components"]["title_similarity"] is None
    assert result["total"] > 0


def test_empty_candidate_is_an_error_not_a_zero() -> None:
    with pytest.raises(NothingToScoreError, match="candidate"):
        score({"skills": [], "full_name": "Maria Ionescu"}, JOB)


def test_unparsed_candidate_is_an_error() -> None:
    # The backend stores {} for a candidate whose CV has not been parsed yet.
    with pytest.raises(NothingToScoreError, match="candidate"):
        score({}, JOB)


def test_empty_job_is_an_error() -> None:
    with pytest.raises(NothingToScoreError, match="job"):
        score(PARTIAL, {"title": " ", "required_skills": []})


def test_nothing_to_score_is_still_a_value_error() -> None:
    # Code that already catches ValueError keeps working.
    assert issubclass(NothingToScoreError, ValueError)
