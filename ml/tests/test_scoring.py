"""Tests for the baseline scorer."""

import pytest

from ats_scoring import MODEL_VERSION, WEIGHTS, score

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
}

# Same field, half of the required skills, written differently.
PARTIAL = {
    "headline": "Backend Developer",
    "summary": "Builds REST services in Python.",
    "skills": ["python", "Postgres", "Git"],
}

# Shares no skill and no word with the job.
UNRELATED = {
    "headline": "Pastry Chef",
    "summary": "Bakes croissants, tarts and sourdough bread every morning.",
    "skills": ["Baking", "Cake Decorating", "Food Safety"],
}


def test_identical_pair_scores_100() -> None:
    result = score(IDENTICAL, JOB)

    assert result["total"] == 100.0
    assert result["components"] == {"skill_overlap": 100.0, "text_similarity": 100.0}
    assert result["matched_skills"] == IDENTICAL["skills"]
    assert result["missing_skills"] == []


def test_unrelated_pair_scores_0() -> None:
    result = score(UNRELATED, JOB)

    assert result["total"] == 0.0
    assert result["components"] == {"skill_overlap": 0.0, "text_similarity": 0.0}
    assert result["matched_skills"] == []
    assert result["missing_skills"] == ["Python", "PostgreSQL", "Docker", "REST APIs"]


def test_partial_pair_scores_in_between() -> None:
    result = score(PARTIAL, JOB)

    # 2 of 4 required skills and 0 of 2 preferred ones: 2 / (4 + 0.5 * 2) = 40%.
    assert result["components"]["skill_overlap"] == 40.0
    assert result["matched_skills"] == ["Python", "PostgreSQL"]
    assert result["missing_skills"] == ["Docker", "REST APIs"]
    assert 0 < result["components"]["text_similarity"] < 100
    assert 0 < result["total"] < 100


def test_better_matches_score_higher() -> None:
    totals = [score(candidate, JOB)["total"] for candidate in (IDENTICAL, PARTIAL, UNRELATED)]

    assert totals == sorted(totals, reverse=True)
    assert len(set(totals)) == 3


@pytest.mark.parametrize("candidate", [IDENTICAL, PARTIAL, UNRELATED])
def test_result_has_the_agreed_shape_and_range(candidate: dict[str, object]) -> None:
    result = score(candidate, JOB)

    assert set(result) == {
        "total",
        "components",
        "matched_skills",
        "missing_skills",
        "model_version",
    }
    assert result["model_version"] == MODEL_VERSION
    assert 0 <= result["total"] <= 100
    for value in result["components"].values():
        assert value is not None
        assert 0 <= value <= 100


def test_total_is_the_weighted_mix_of_the_components() -> None:
    result = score(PARTIAL, JOB)
    components = result["components"]

    expected = (
        WEIGHTS["skill_overlap"] * components["skill_overlap"]
        + WEIGHTS["text_similarity"] * components["text_similarity"]
    )
    assert result["total"] == pytest.approx(expected, abs=0.02)


def test_scoring_is_repeatable() -> None:
    assert score(PARTIAL, JOB) == score(PARTIAL, JOB)


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

    assert score(with_identity, JOB) == score(plain, JOB)


def test_work_history_counts_towards_the_text_similarity() -> None:
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


def test_job_without_skills_is_scored_on_text_alone() -> None:
    job = {"title": JOB["title"], "description": JOB["description"]}

    result = score(PARTIAL, job)

    assert result["components"]["skill_overlap"] is None
    assert result["total"] == result["components"]["text_similarity"]
    assert result["matched_skills"] == []
    assert result["missing_skills"] == []


def test_missing_and_null_fields_are_tolerated() -> None:
    candidate = {"summary": "Builds REST services in Python.", "skills": None, "work_history": None}

    result = score(candidate, JOB)

    assert result["matched_skills"] == []
    assert result["total"] > 0


def test_empty_candidate_is_an_error_not_a_zero() -> None:
    with pytest.raises(ValueError, match="candidate"):
        score({"skills": [], "full_name": "Maria Ionescu"}, JOB)


def test_empty_job_is_an_error() -> None:
    with pytest.raises(ValueError, match="job"):
        score(PARTIAL, {"title": " ", "required_skills": []})
