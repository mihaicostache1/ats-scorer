"""Tests for the draft parsed-CV schema shared with the backend."""

import pytest
from jsonschema import Draft202012Validator

from ats_scoring import score
from ats_scoring.schema import (
    PARSED_CV_SCHEMA_VERSION,
    load_parsed_cv_example,
    load_parsed_cv_schema,
)


@pytest.fixture(scope="module")
def validator() -> Draft202012Validator:
    schema = load_parsed_cv_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def test_example_is_valid(validator: Draft202012Validator) -> None:
    assert list(validator.iter_errors(load_parsed_cv_example())) == []


def test_schema_and_example_use_the_current_version() -> None:
    schema = load_parsed_cv_schema()

    assert schema["properties"]["schema_version"]["const"] == PARSED_CV_SCHEMA_VERSION
    assert load_parsed_cv_example()["schema_version"] == PARSED_CV_SCHEMA_VERSION


def test_a_record_with_only_skills_is_valid(validator: Draft202012Validator) -> None:
    assert validator.is_valid({"skills": []})


@pytest.mark.parametrize(
    "record",
    [
        {},
        {"skills": "Python"},
        {"skills": ["Python"], "experience_years": -1},
        {"skills": [], "work_history": [{"company": "Nimbuscraft Labs"}]},
        {"skills": [], "work_history": [{"title": "Developer", "start": "March 2021"}]},
        {"skills": [], "education": [{"institution": "Lakeshore University"}]},
    ],
)
def test_malformed_records_are_rejected(
    validator: Draft202012Validator, record: dict[str, object]
) -> None:
    assert not validator.is_valid(record)


def test_scorer_accepts_the_example() -> None:
    job = {
        "title": "Backend Developer",
        "description": "Build REST services in Python.",
        "required_skills": ["Python", "Docker", "Kafka"],
    }

    result = score(load_parsed_cv_example(), job)

    assert result["matched_skills"] == ["Python", "Docker"]
    assert result["missing_skills"] == ["Kafka"]
