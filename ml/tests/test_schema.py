"""Tests for the parsed-CV schema (version 1.0) shared with the backend and the frontend.

The JSON Schema and the Pydantic models are two descriptions of one shape. The fixtures in
ats_scoring/schemas/fixtures/ are checked against both, so a change to one that is not made
to the other fails here.
"""

import copy
from typing import Any, get_args

import pytest
from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError

from ats_scoring import score
from ats_scoring.parsed_cv import (
    SCHEMA_VERSION,
    Contact,
    Education,
    Experience,
    Language,
    ParsedCV,
    Skill,
)
from ats_scoring.schema import (
    PARSED_CV_SCHEMA_VERSION,
    fixture_names,
    load_parsed_cv_example,
    load_parsed_cv_fixture,
    load_parsed_cv_schema,
)

VALID = fixture_names("valid")
INVALID = fixture_names("invalid")

# Why each invalid fixture is invalid: text that must appear in a JSON Schema error. It keeps a
# fixture from passing for the wrong reason, and a new fixture has to say what is wrong with it.
WHY_INVALID = {
    "confidence_above_one": "maximum of 1",
    "confidence_as_text": "'high' is not of type 'number'",
    "confidence_key_not_a_pointer": "'contact.email' does not match",
    "contact_unknown_field": "date_of_birth",
    "education_missing_degree": "'degree' is a required property",
    "empty_object": "'schema_version' is a required property",
    "experience_bad_date": "experiences/0/start",
    "experience_is_current_as_text": "experiences/0/is_current",
    "experience_missing_title": "'title' is a required property",
    "grad_year_as_text": "education/0/grad_year",
    "language_as_plain_string": "languages/0",
    "language_missing_name": "'language' is a required property",
    "legacy_work_history_field": "work_history",
    "missing_schema_version": "'schema_version' is a required property",
    "missing_skills": "'skills' is a required property",
    "missing_source": "'source' is a required property",
    "negative_experience_years": "experience_years",
    "old_draft_version": "schema_version",
    "skill_as_plain_string": "skills/0",
    "skill_empty_raw": "skills/0/raw",
    "skill_missing_normalized": "'normalized' is a required property",
    "unknown_schema_version": "schema_version",
    "unknown_source": "source",
}


@pytest.fixture(scope="module")
def validator() -> Draft202012Validator:
    schema = load_parsed_cv_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def error_texts(validator: Draft202012Validator, record: dict[str, Any]) -> list[str]:
    return [
        f"{'/'.join(str(part) for part in error.absolute_path)} {error.message}"
        for error in validator.iter_errors(record)
    ]


# ------------------------------------------------------------------ fixtures


@pytest.mark.parametrize("name", VALID)
def test_valid_fixture_passes_the_json_schema(validator: Draft202012Validator, name: str) -> None:
    assert error_texts(validator, load_parsed_cv_fixture("valid", name)) == []


@pytest.mark.parametrize("name", VALID)
def test_valid_fixture_passes_the_pydantic_model(name: str) -> None:
    ParsedCV.model_validate(load_parsed_cv_fixture("valid", name))


@pytest.mark.parametrize("name", VALID)
def test_model_output_passes_the_json_schema(validator: Draft202012Validator, name: str) -> None:
    parsed = ParsedCV.model_validate(load_parsed_cv_fixture("valid", name))

    assert error_texts(validator, parsed.model_dump(mode="json")) == []


@pytest.mark.parametrize("name", INVALID)
def test_invalid_fixture_fails_the_json_schema(validator: Draft202012Validator, name: str) -> None:
    errors = error_texts(validator, load_parsed_cv_fixture("invalid", name))

    assert errors, "the fixture is valid"
    assert any(WHY_INVALID[name] in error for error in errors), errors


@pytest.mark.parametrize("name", INVALID)
def test_invalid_fixture_fails_the_pydantic_model(name: str) -> None:
    with pytest.raises(ValidationError):
        ParsedCV.model_validate(load_parsed_cv_fixture("invalid", name))


def test_every_invalid_fixture_says_why_it_is_invalid() -> None:
    assert sorted(WHY_INVALID) == INVALID


def test_the_set_of_fixtures_covers_the_main_cases() -> None:
    assert {"full", "minimal", "recruiter_corrected"} <= set(VALID)


# ------------------------------------------------------------------ version


def test_the_version_is_the_same_everywhere() -> None:
    schema = load_parsed_cv_schema()

    assert schema["properties"]["schema_version"]["enum"] == [SCHEMA_VERSION]
    assert get_args(ParsedCV.model_fields["schema_version"].annotation) == (SCHEMA_VERSION,)
    assert PARSED_CV_SCHEMA_VERSION == SCHEMA_VERSION
    assert {load_parsed_cv_fixture("valid", name)["schema_version"] for name in VALID} == {
        SCHEMA_VERSION
    }


def test_the_example_is_the_full_fixture() -> None:
    assert load_parsed_cv_example() == load_parsed_cv_fixture("valid", "full")


# ------------------------------------------------------------------ the two descriptions match


def schema_objects() -> dict[str, tuple[dict[str, Any], type[BaseModel]]]:
    schema = load_parsed_cv_schema()
    defs = schema["$defs"]
    return {
        "ParsedCV": (schema, ParsedCV),
        "contact": (defs["contact"], Contact),
        "skill": (defs["skill"], Skill),
        "experience": (defs["experience"], Experience),
        "education": (defs["education"], Education),
        "language": (defs["language"], Language),
    }


@pytest.mark.parametrize("name", list(schema_objects()))
def test_json_schema_and_model_have_the_same_fields(name: str) -> None:
    definition, model = schema_objects()[name]

    assert set(definition["properties"]) == set(model.model_fields)
    assert set(definition.get("required", [])) == {
        field for field, info in model.model_fields.items() if info.is_required()
    }


@pytest.mark.parametrize("name", list(schema_objects()))
def test_objects_are_closed(name: str) -> None:
    definition, model = schema_objects()[name]

    assert definition["additionalProperties"] is False
    assert model.model_config["extra"] == "forbid"


# ------------------------------------------------------------------ behaviour worth pinning


def test_a_record_without_contact_gets_an_empty_contact() -> None:
    parsed = ParsedCV.model_validate(load_parsed_cv_fixture("valid", "minimal"))

    assert parsed.contact == Contact()
    assert parsed.experiences == []


def test_a_skill_that_is_not_recognized_keeps_its_raw_text() -> None:
    parsed = ParsedCV.model_validate(load_parsed_cv_fixture("valid", "full"))

    unrecognized = [skill for skill in parsed.skills if skill.normalized is None]
    assert [skill.raw for skill in unrecognized] == ["Team player"]


# ------------------------------------------------------------------ the scorer


JOB = {
    "title": "Backend Developer",
    "description": "Build REST services in Python.",
    "required_skills": ["Python", "PostgreSQL", "Kubernetes", "Kafka"],
}


def legacy_shape(record: dict[str, Any]) -> dict[str, Any]:
    """The draft 0.1 shape of a 1.0 record, as the synthetic data still has it."""
    legacy = copy.deepcopy(record)
    legacy["skills"] = [skill["raw"] for skill in record["skills"]]
    legacy["work_history"] = legacy.pop("experiences")
    return legacy


def test_scorer_accepts_the_example() -> None:
    result = score(load_parsed_cv_example(), JOB)

    assert result["matched_skills"] == ["Python", "PostgreSQL", "Kubernetes"]
    assert result["missing_skills"] == ["Kafka"]


def test_scorer_gives_the_same_score_for_the_draft_shape() -> None:
    record = load_parsed_cv_example()

    assert score(legacy_shape(record), JOB) == score(record, JOB)


def test_contact_and_confidence_do_not_change_the_score() -> None:
    record = load_parsed_cv_example()
    changed = copy.deepcopy(record)
    changed["contact"] = {"name": "Maria Ionescu", "location": "Bucharest"}
    changed["confidence"] = {"/skills/0/raw": 0.1}
    changed["languages"] = [{"language": "Romanian", "level": "native"}]

    assert score(changed, JOB) == score(record, JOB)
