"""Tests for redaction before scoring (L-14, US-06)."""

import copy
import json
import re
from datetime import date
from typing import Any

import pytest

from ats_scoring import redact, score
from ats_scoring import scoring as scoring_module
from ats_scoring.parsed_cv import ParsedCV
from ats_scoring.redaction import coarse_location, total_experience_years

AS_OF = date(2026, 11, 10)

JOB = {
    "title": "Backend Developer",
    "description": "Build REST services in Python and .NET with PostgreSQL.",
    "required_skills": ["Python", "PostgreSQL", "C#"],
    "preferred_skills": ["Kafka"],
    "min_experience_years": 3,
}


def candidate(name: str = "Maria Ionescu", **text: str) -> dict[str, Any]:
    """A valid schema 1.0 record with identity details everywhere a parser could put them."""
    first, last = name.split()
    email = f"{first}.{last}@example.com".lower()
    words = {
        "honorific": "Ms",
        "subject": "She",
        "possessive": "her",
        "job_word": "Saleswoman",
        **text,
    }
    return {
        "schema_version": "1.0",
        "source": "parser",
        "contact": {
            "name": name,
            "email": email,
            "phone": "+40 722 123 456",
            "location": "Str. Lipscani 12, Bucharest, Romania",
            "links": [f"https://linkedin.com/in/{first}-{last}".lower()],
        },
        "headline": "Backend Developer",
        "summary": (
            f"{words['honorific']} {name} ({first.lower()}.jpg, photo attached) builds REST "
            f"services in Python. {words['subject']} was born in Cluj in 1994. Date of birth: "
            f"14.03.1994. Gender: female. Reach {first} at {email} or 0722 123 456. "
            f"{words['subject']} mentors {words['possessive']} team."
        ),
        "skills": [
            {"raw": "Python", "normalized": "Python"},
            {"raw": "PostgreSQL", "normalized": "PostgreSQL"},
            {"raw": "C#", "normalized": "C#"},
            {"raw": "SQL Server 2019", "normalized": None},
        ],
        "experiences": [
            {
                "title": "Backend Developer",
                "company": "Ferrowind Technologies",
                "start": "2021-03",
                "is_current": True,
                "bullets": [
                    "Built .NET services, March 2021 - present",
                    f"Led the migration while {first} was team lead (2022–2023)",
                ],
            },
            {
                "title": f"Senior {words['job_word']}",
                "company": "Corvid Retail",
                "start": "2016-01",
                "end": "2021-06",
                "summary": f"Top {words['job_word'].lower()} in 2018, after maternity leave",
            },
        ],
        "education": [
            {
                "degree": "B.Sc. Computer Science (class of 2015)",
                "institution": "University of Bucharest",
                "grad_year": 2015,
            }
        ],
        "languages": [{"language": "Romanian", "level": "native"}],
        "certifications": ["AWS Certified Developer (2020)"],
        "confidence": {"/contact/name": 0.95, "/education/0/grad_year": 0.8},
    }


MARIA = candidate()
# Everything that must not get through for MARIA, compared case-insensitively.
REDACTED_VALUES = [
    "Maria",
    "Ionescu",
    "maria.ionescu@example.com",
    "linkedin",
    "722",
    "Lipscani",
    "12,",
    ".jpg",
    "photo",
    "1994",
    "14.03",
    "Cluj",
    "female",
    "2015",
    "2016",
    "2018",
    "2021",
    "2022",
    "March",
    "grad_year",
    "start",
    "confidence",
    "maternity",
    "Saleswoman",
]
GENDERED = re.compile(r"\b(?:she|her|hers|herself|he|him|his|himself|Ms|Mr|Mrs)\b", re.I)


def leaks(value: object) -> list[str]:
    text = json.dumps(value, ensure_ascii=False, default=str)
    found = [item for item in REDACTED_VALUES if item.casefold() in text.casefold()]
    return found + GENDERED.findall(text)


# --------------------------------------------------------------------------- the record


def test_no_redacted_value_is_left_in_the_record() -> None:
    assert leaks(MARIA)  # the check would catch them
    assert leaks(redact(MARIA, as_of=AS_OF)) == []


def test_qualifications_are_kept() -> None:
    redacted = redact(MARIA, as_of=AS_OF)

    assert redacted["headline"] == "Backend Developer"
    assert redacted["summary"] == (
        "builds REST services in Python. They was. Reach at or. They mentors their team."
    )
    assert redacted["skills"] == MARIA["skills"]  # "SQL Server 2019" keeps its year
    first, second = redacted["experiences"]
    assert first == {
        "title": "Backend Developer",
        "company": "Ferrowind Technologies",
        "is_current": True,
        "bullets": ["Built .NET services", "Led the migration while was team lead"],
    }
    assert second["title"] == "Senior Salesperson"
    assert second["summary"] == "Top salesperson, after parental leave"
    assert redacted["education"] == [
        {"degree": "B.Sc. Computer Science", "institution": "University of Bucharest"}
    ]
    assert redacted["languages"] == MARIA["languages"]
    assert redacted["certifications"] == ["AWS Certified Developer"]


def test_country_or_region_is_kept_for_location_fit() -> None:
    assert redact(MARIA, as_of=AS_OF)["contact"] == {"location": "Bucharest, Romania"}


@pytest.mark.parametrize(
    ("location", "kept"),
    [
        ("12 Baker Street, London, NW1 6XE, United Kingdom", "London, United Kingdom"),
        ("Bd. Unirii 5, bl. A2, ap. 4, Sector 3, Bucharest, Romania", "Bucharest, Romania"),
        ("Cluj-Napoca, Romania", "Cluj-Napoca, Romania"),
        ("Remote", "Remote"),
        ("221B", None),
        (None, None),
    ],
)
def test_coarse_location(location: str | None, kept: str | None) -> None:
    assert coarse_location(location) == kept


def test_experience_is_computed_before_the_dates_are_dropped() -> None:
    # 2016-01 to 2021-06 and 2021-03 to now overlap: counted once, 2016-01 to 2026-11.
    redacted = redact(MARIA, as_of=AS_OF)

    assert redacted["experience_years"] == 10.8
    assert all("start" not in item and "end" not in item for item in redacted["experiences"])


def test_stated_experience_is_kept() -> None:
    assert redact({**MARIA, "experience_years": 7.5}, as_of=AS_OF)["experience_years"] == 7.5


@pytest.mark.parametrize(
    ("positions", "years"),
    [
        ([{"start": "2020-01", "end": "2021-01"}, {"start": "2022-01", "end": "2022-07"}], 1.5),
        ([{"start": "2020-01", "end": "2022-01"}, {"start": "2021-01", "end": "2021-06"}], 2.0),
        ([{"start": "2025-11", "is_current": True}], 1.0),
        ([{"start": "2020-01", "end": "2021-01"}, {"start": "2022-01"}], None),  # end unknown
        ([{"start": "2021-01", "end": "2020-01"}], None),
        ([{"start": "2020", "end": "2021"}], None),
        ([], None),
    ],
)
def test_total_experience_years(positions: list[dict[str, Any]], years: float | None) -> None:
    assert total_experience_years(positions, AS_OF) == years


def test_the_redacted_record_is_still_a_valid_parsed_cv() -> None:
    ParsedCV.model_validate(MARIA)

    ParsedCV.model_validate(redact(MARIA, as_of=AS_OF))


def test_fields_outside_the_schema_are_dropped() -> None:
    record = {
        **MARIA,
        "photo": "maria.jpg",
        "date_of_birth": "1994-03-14",
        "gender": "female",
        "nationality": "Romanian",
        "address": "Str. Lipscani 12",
    }

    assert redact(record, as_of=AS_OF) == redact(MARIA, as_of=AS_OF)


def test_redacting_twice_changes_nothing_more() -> None:
    once = redact(MARIA, as_of=AS_OF)

    assert redact(once, as_of=AS_OF) == once


def test_the_input_is_not_changed() -> None:
    record = copy.deepcopy(MARIA)

    redact(record, as_of=AS_OF)

    assert record == MARIA


def test_the_draft_shape_is_kept() -> None:
    draft = {
        "schema_version": "0.1",
        "headline": "Data Analyst",
        "skills": ["SQL", "Tableau"],
        "experience_years": 3.2,
        "work_history": [{"title": "Data Analyst", "years": 3.2, "start": "2022-09"}],
        "education": [{"degree": "B.Sc. Statistics", "grad_year": 2022}],
    }

    assert redact(draft) == {
        "schema_version": "0.1",
        "headline": "Data Analyst",
        "skills": ["SQL", "Tableau"],
        "experience_years": 3.2,
        "work_history": [{"title": "Data Analyst", "years": 3.2}],
        "education": [{"degree": "B.Sc. Statistics"}],
    }


# --------------------------------------------------------------------------- free text


@pytest.mark.parametrize(
    ("text", "redacted"),
    [
        ("He led his team and mentored him.", "They led their team and mentored them."),
        ("S/he owns it. His/her code.", "They owns it. Their code."),
        ("Mr. Popescu is a Chairman", "Popescu is a Chairperson"),
        ("Born on 14 March 1994 in Iasi. Python developer", "Python developer"),
        ("Age: 34. Python developer, aged 34, 34 years old", "Python developer"),
        ("Call +44 20 7946 0958 or 415-555-0100.", "Call or."),
        ("See github.com/mionescu and www.example.com/cv", "See and"),
        ("Graduated in 2012 (2008 - 2012), worked 05/2013 to now", "worked"),
        ("Photo: me.png [photo] Kotlin", "Kotlin"),
        ("Marital status: married; Nationality: Romanian; Go", "Go"),
    ],
)
def test_free_text_is_scrubbed(text: str, redacted: str) -> None:
    assert redact({"summary": text})["summary"] == redacted


@pytest.mark.parametrize(
    "text",
    [
        "Built .NET and C# services; p99 latency under 50 ms on MS SQL.",
        "Never miss a deadline. Served 10 000 users with a 4-person team.",
        "Photography, Photo Editing and HER2 research",
        "Python 3.12, ISO 27001, 5+ years of experience",
        "",
    ],
)
def test_text_without_identity_details_is_unchanged(text: str) -> None:
    assert redact({"summary": text}) == {"summary": text or None}


# --------------------------------------------------------------------------- the scorer


def test_no_redacted_value_reaches_the_scorer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Records every argument the scorer's parts receive."""
    received: list[object] = []

    def recorded(name: str) -> None:
        original = getattr(scoring_module, name)

        def spy(*args: object, **kwargs: object) -> object:
            received.append((name, args, kwargs))
            return original(*args, **kwargs)

        monkeypatch.setattr(scoring_module, name, spy)

    for name in ("candidate_text", "skill_texts", "match_skills", "experience_fit", "match_title"):
        recorded(name)

    result = score(MARIA, JOB)

    assert {name for name, *_ in received} == {
        "candidate_text",
        "skill_texts",
        "match_skills",
        "experience_fit",
        "match_title",
    }
    assert leaks([args for _, args, _ in received]) == []
    assert leaks(result) == []


def test_only_a_different_name_gives_an_identical_score() -> None:
    other = candidate("Andrei Popescu")
    assert redact(other, as_of=AS_OF) == redact(MARIA, as_of=AS_OF)

    assert score(other, JOB) == score(MARIA, JOB)


def test_only_different_gender_coded_details_give_an_identical_score() -> None:
    other = candidate(honorific="Mr", subject="He", possessive="his", job_word="Salesman")
    assert redact(other, as_of=AS_OF) == redact(MARIA, as_of=AS_OF)

    assert score(other, JOB) == score(MARIA, JOB)


def test_the_score_still_uses_the_qualifications() -> None:
    result = score(MARIA, JOB)

    assert result["matched_skills"] == ["Python", "PostgreSQL", "C#"]
    assert result["components"]["experience_fit"] == 100.0
    assert result["components"]["title_similarity"] == 100.0
