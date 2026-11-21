"""Tests for the explanation returned with every score (L-17, US-09).

The JSON Schema and the Pydantic model are two descriptions of one shape. The example payloads
in ats_scoring/schemas/examples/score_explanation/ and every explanation of the evaluation set
are checked against both, so a change to one that is not made to the other fails here.
"""

import copy
import importlib.util
import json
import re
import string
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from ats_scoring import EXPLANATION_VERSION, MODEL_VERSION, ScoreExplanation, score, score_batch
from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG, BandSettings
from ats_scoring.explanation import COMPONENT_NAMES, LABELS, TEMPLATES, band
from ats_scoring.schema import (
    load_parsed_cv_fixture,
    load_score_explanation_example,
    load_score_explanation_schema,
    score_explanation_example_names,
)

ML = Path(__file__).resolve().parents[1]
EVAL_DATA = ML / "evaluation" / "data"

JOB: dict[str, Any] = {
    "title": "Backend Developer",
    "description": "Build and run REST services in Python on PostgreSQL and Kubernetes.",
    "required_skills": ["Python", "PostgreSQL", "Kubernetes", "Docker"],
    "preferred_skills": ["FastAPI", "Redis"],
    "min_experience_years": 3,
}
CV = load_parsed_cv_fixture("valid", "full")  # writes "Postgres" and "k8s"


@pytest.fixture(scope="module")
def validator() -> Draft202012Validator:
    schema = load_score_explanation_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def assert_valid(validator: Draft202012Validator, payload: dict[str, Any]) -> None:
    errors = [error.message for error in validator.iter_errors(payload)]
    assert errors == []
    ScoreExplanation.model_validate(payload)
    # JSON-ready: it survives a round trip to the JSONB column unchanged.
    assert json.loads(json.dumps(payload)) == payload


def evaluation_explanations() -> list[tuple[str, dict[str, Any]]]:
    """Every job of the evaluation set against every CV, with the stored embeddings."""
    embeddings = json.loads((EVAL_DATA / "embeddings.json").read_text(encoding="utf-8"))
    paths = sorted((EVAL_DATA / "candidates").glob("*.json"))
    candidates = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    vectors = [embeddings["candidates"][path.stem] for path in paths]
    results = []
    for job_path in sorted((EVAL_DATA / "jobs").glob("*.json")):
        job = json.loads(job_path.read_text(encoding="utf-8"))
        batch = score_batch(
            job,
            candidates,
            candidate_embeddings=vectors,
            job_embedding=embeddings["jobs"][job_path.stem],
        )
        for path, result in zip(paths, batch, strict=True):
            assert result is not None
            results.append((f"{path.stem}-{job_path.stem}", result))
    return results


EVALUATION = evaluation_explanations()


# --------------------------------------------------------------------------- schema and model


def test_component_names_follow_the_scorer() -> None:
    assert COMPONENT_NAMES == COMPONENTS
    assert list(LABELS) == list(COMPONENTS)
    schema = load_score_explanation_schema()
    assert tuple(schema["$defs"]["component"]["properties"]["name"]["enum"]) == COMPONENTS


def test_versions_agree() -> None:
    schema = load_score_explanation_schema()
    assert schema["properties"]["explanation_version"]["const"] == EXPLANATION_VERSION
    assert schema["description"].startswith(f"Version {EXPLANATION_VERSION}.")


def test_there_are_examples_for_the_frontend() -> None:
    assert set(score_explanation_example_names()) >= {"strong", "moderate", "weak"}


@pytest.mark.parametrize("name", score_explanation_example_names())
def test_examples_are_valid(validator: Draft202012Validator, name: str) -> None:
    assert_valid(validator, load_score_explanation_example(name))


def load_example_script() -> ModuleType:
    path = ML / "evaluation" / "explanation_examples.py"
    spec = importlib.util.spec_from_file_location("explanation_examples", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_examples_are_what_the_scorer_returns() -> None:
    """Run `python evaluation/explanation_examples.py` after changing the scorer."""
    examples = load_example_script().build_examples()

    assert sorted(examples) == score_explanation_example_names()
    for name, explanation in examples.items():
        assert explanation == load_score_explanation_example(name), name
    bands = {name: examples[name]["band"] for name in ("strong", "moderate", "weak")}
    assert bands == {"strong": "strong", "moderate": "moderate", "weak": "weak"}


def mutate(path: tuple[str | int, ...], value: Any) -> dict[str, Any]:
    payload = copy.deepcopy(load_score_explanation_example("strong"))
    target = payload
    for key in path[:-1]:
        target = target[key]
    if value is KeyError:
        del target[path[-1]]
    else:
        target[path[-1]] = value
    return payload


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("explanation_version",), "2.0"),
        (("band",), "excellent"),
        (("total",), 101),
        (("summary",), ""),
        (("advisory_note",), KeyError),
        (("contact",), {"name": "Maria Ionescu"}),  # closed: no room for identity details
        (("components", 0, "score"), -1),
        (("components", 0, "weight"), 1.5),
        (("components", 0, "name"), "location_fit"),
        (("components", 0, "statement"), KeyError),
        (("components",), []),
        (("matched_skills", 0, "cv_phrase"), KeyError),
        (("matched_skills", 0, "requirement"), "optional"),
        (("missing_skills", "preferred"), KeyError),
        (("experience", "status"), "exceeds"),
        (("experience", "candidate_years"), -2),
        (("experience", "required_years"), "3"),
    ],
)
def test_invalid_payloads_are_rejected_by_both(
    validator: Draft202012Validator, path: tuple[str | int, ...], value: Any
) -> None:
    payload = mutate(path, value)

    assert list(validator.iter_errors(payload)), "JSON Schema accepted it"
    with pytest.raises(ValidationError):
        ScoreExplanation.model_validate(payload)


# --------------------------------------------------------------------------- the payload


@pytest.mark.parametrize(("pair", "result"), EVALUATION, ids=[pair for pair, _ in EVALUATION])
def test_every_evaluation_explanation_is_valid_and_agrees_with_the_score(
    validator: Draft202012Validator, pair: str, result: dict[str, Any]
) -> None:
    explanation = result["explanation"]
    assert_valid(validator, explanation)

    assert explanation["model_version"] == result["model_version"] == MODEL_VERSION
    assert explanation["total"] == result["total"]
    assert explanation["band"] == band(result["total"], DEFAULT_CONFIG.bands)
    parts = explanation["components"]
    assert [part["name"] for part in parts] == list(COMPONENTS)
    assert {part["name"]: part["score"] for part in parts} == result["components"]
    assert {part["name"]: part["weight"] for part in parts} == result["weights"]
    contributions = sum(part["contribution"] for part in parts)
    assert contributions == pytest.approx(result["total"], abs=0.05)
    assert [skill["skill"] for skill in explanation["matched_skills"]] == result["matched_skills"]
    assert explanation["missing_skills"]["required"] == result["missing_skills"]
    statements = [part["statement"] for part in parts[1:]]
    assert result["score_explanations"][-4:] == statements


def test_matched_skills_carry_the_phrase_found_in_the_cv() -> None:
    explanation = score(CV, JOB)["explanation"]

    assert explanation["matched_skills"] == [
        {"skill": "Python", "requirement": "required", "cv_phrase": "Python"},
        {"skill": "PostgreSQL", "requirement": "required", "cv_phrase": "Postgres"},
        {"skill": "Kubernetes", "requirement": "required", "cv_phrase": "k8s"},
        {"skill": "FastAPI", "requirement": "preferred", "cv_phrase": "FastAPI"},
    ]
    assert explanation["missing_skills"] == {"required": ["Docker"], "preferred": ["Redis"]}


def test_a_matched_skill_shows_the_first_spelling_in_the_cv() -> None:
    cv = {**CV, "skills": [{"raw": "PostgreSQL 15", "normalized": None}, "postgres", "Postgres"]}

    [matched] = score(cv, {**JOB, "required_skills": ["PostgreSQL"]})["explanation"][
        "matched_skills"
    ]

    assert matched["cv_phrase"] == "postgres"


def test_a_skill_both_required_and_preferred_is_listed_once_as_required() -> None:
    job = {**JOB, "required_skills": ["Python"], "preferred_skills": ["python", "Redis"]}

    explanation = score(CV, job)["explanation"]

    assert [(s["skill"], s["requirement"]) for s in explanation["matched_skills"]] == [
        ("Python", "required")
    ]
    assert explanation["missing_skills"] == {"required": [], "preferred": ["Redis"]}


def test_contributions_add_up_and_a_missing_component_adds_nothing() -> None:
    explanation = score(CV, JOB)["explanation"]  # no embeddings
    parts = {part["name"]: part for part in explanation["components"]}

    assert parts["embedding_similarity"] == {
        "name": "embedding_similarity",
        "label": "Similarity of meaning",
        "score": None,
        "weight": 0.0,
        "contribution": 0.0,
        "statement": TEMPLATES["embedding.missing"],
    }
    total = sum(part["contribution"] for part in parts.values())
    assert total == pytest.approx(explanation["total"], abs=0.05)


@pytest.mark.parametrize(
    ("years", "minimum", "status", "statement"),
    [
        (5.5, 3, "meets", "Has 5.5 years of experience; the job asks for at least 3 years."),
        (3, 3, "meets", "Has 3 years of experience; the job asks for at least 3 years."),
        (1, 3, "below", "Has 1 year of experience, below the 3 years the job asks for."),
        (5.5, None, "not_required", TEMPLATES["experience.not_required"]),
        (5.5, 0, "not_required", TEMPLATES["experience.zero_required"]),
        (None, 3, "unknown", TEMPLATES["experience.unknown"]),
    ],
)
def test_experience_fit_statement(
    years: float | None, minimum: float | None, status: str, statement: str
) -> None:
    cv = {**CV, "experience_years": years, "experiences": []}  # no dates to compute years from

    experience = score(cv, {**JOB, "min_experience_years": minimum})["explanation"]["experience"]

    assert experience == {
        "status": status,
        "candidate_years": None if years is None else float(years),
        "required_years": None if minimum is None else float(minimum),
        "statement": statement,
    }


def test_a_job_without_skills_or_minimum_says_so() -> None:
    job = {"title": "Software Engineer", "description": "Web services for logistics."}

    explanation = score(CV, job)["explanation"]

    assert explanation["matched_skills"] == []
    assert explanation["missing_skills"] == {"required": [], "preferred": []}
    assert explanation["summary"].endswith(
        f"{TEMPLATES['skills.none']} {TEMPLATES['experience.not_required']}"
    )


@pytest.mark.parametrize(
    ("total", "expected"),
    [(100, "strong"), (60, "strong"), (59.99, "moderate"), (40, "moderate"), (39.99, "weak")],
)
def test_bands(total: float, expected: str) -> None:
    assert band(total, BandSettings(strong=60, moderate=40)) == expected


def test_the_band_follows_weights_yaml() -> None:
    """L-18: picked on the L-9 pairs, checked on the L-15 pairs (docs/ml/experiments.md)."""
    assert DEFAULT_CONFIG.bands == BandSettings(strong=70, moderate=50)


def test_the_advisory_note_is_always_there() -> None:
    for _, result in EVALUATION:
        assert result["explanation"]["advisory_note"] == TEMPLATES["advisory"]
    note = TEMPLATES["advisory"]
    assert "advisory" in note and "wrong" in note and "not a chance of passing" in note


# --------------------------------------------------------------------------- templates only


def template_pattern(template: str) -> str:
    """A regular expression matching any text the template can produce."""
    parts = []
    for literal, field, _, _ in string.Formatter().parse(template):
        parts.append(re.escape(literal))
        if field is not None:
            parts.append(".+?")
    return "".join(parts)


SENTENCE = "(?:" + "|".join(template_pattern(text) for text in TEMPLATES.values()) + ")"
FROM_TEMPLATES = re.compile(f"{SENTENCE}(?: {SENTENCE})*")


def texts(explanation: dict[str, Any]) -> list[str]:
    found = [explanation["summary"], explanation["advisory_note"]]
    found += [part["statement"] for part in explanation["components"]]
    found.append(explanation["experience"]["statement"])
    return found


def test_every_text_comes_from_a_template() -> None:
    explanations = [result["explanation"] for _, result in EVALUATION]
    explanations += [load_score_explanation_example(n) for n in score_explanation_example_names()]
    for explanation in explanations:
        for text in texts(explanation):
            assert FROM_TEMPLATES.fullmatch(text), text
    assert not FROM_TEMPLATES.fullmatch("This candidate seems like a great culture fit.")


def test_the_same_score_always_gets_the_same_words() -> None:
    assert score(CV, JOB)["explanation"] == score(copy.deepcopy(CV), dict(JOB))["explanation"]
