"""Parser behavior and the shared L-10/L-11 boundaries, without a database."""

from datetime import date
from unittest.mock import Mock

import jsonschema
import pytest
import spacy
from ats_scoring.esco import load_esco
from ats_scoring.parsed_cv import SCHEMA_VERSION, Contact, Experience, ParsedCV, Skill
from ats_scoring.schema import load_parsed_cv_schema
from ats_scoring.skill_normalizer import NormalizedSkill, SkillNormalizer

from app.services.cv_parser import (
    CvParser,
    _experience_years,
    detect_sections,
    get_cv_parser,
    needs_review,
)
from tests.test_cv_extraction import FIXTURES


@pytest.fixture
def parser() -> CvParser:
    nlp = spacy.blank("en")
    ruler = nlp.add_pipe("entity_ruler")
    ruler.add_patterns(
        [
            {"label": "PERSON", "pattern": "Jane Smith"},
            {"label": "ORG", "pattern": "Acme Widgets"},
        ]
    )
    return CvParser(nlp, SkillNormalizer())


def test_sections_case_inline_and_sensitive_fields() -> None:
    assert detect_sections(
        "Jane Smith\nPROFILE:\nDeveloper\nTOOLS AND SKILLS: Python / Docker\n"
        "Date of birth: 01/01/1990\nGender: female\nHobbies\nWalking"
    ) == {
        "header": ["Jane Smith"],
        "summary": ["Developer"],
        "skills": ["Python / Docker"],
        "other": ["Walking"],
    }


@pytest.mark.parametrize(
    "dates,start,end,current",
    [
        ("2020-02 – 2022-03", "2020-02", "2022-03", False),
        ("02/2020 to 3/2022", "2020-02", "2022-03", False),
        ("02.2020 to 03.2022", "2020-02", "2022-03", False),
        ("Feb 2020 - March 2022", "2020-02", "2022-03", False),
        ("February 2020 — Present", "2020-02", None, True),
    ],
)
def test_structured_extraction(
    parser: CvParser,
    dates: str,
    start: str,
    end: str | None,
    current: bool,
) -> None:
    parsed = parser.parse(
        f"Jane Smith\nSoftware Engineer\njane.smith+cv@example.org\n+40 (721) 123-456\n"
        f"Profile\nI build services.\nExperience\nEngineer, Acme Widgets\n{dates}\n"
        "• Built APIs\nSkills\nDocker | FastAPI\nEducation\nB.Sc. Computing\n"
        "Example University, 2019\nLanguages\nEnglish (C1)\nCertifications\nCloud Certificate",
        as_of=date(2026, 1, 1),
    )
    jsonschema.validate(parsed.model_dump(mode="json"), load_parsed_cv_schema())
    assert parsed.schema_version == SCHEMA_VERSION
    assert parsed.contact.name == "Jane Smith"
    assert parsed.contact.email == "jane.smith+cv@example.org"
    assert parsed.contact.phone == "+40 (721) 123-456"
    assert parsed.experiences[0].company == "Acme Widgets"
    assert parsed.experiences[0].start == start
    assert parsed.experiences[0].end == end
    assert parsed.experiences[0].is_current is current
    assert parsed.education[0].institution == "Example University"
    assert parsed.education[0].grad_year == 2019
    assert parsed.languages[0].level == "C1"
    assert not needs_review(parsed)


def test_wrapped_list_and_unknown_skills(parser: CvParser) -> None:
    parsed = parser.parse(
        "Jane Smith\nSkills: Docker / Tailwind\nCSS / Bespoke System / Python/Go / CI/CD / Docker"
    )
    assert [s.raw for s in parsed.skills] == [
        "Docker",
        "Tailwind CSS",
        "Bespoke System",
        "Python",
        "Go",
        "CI/CD",
    ]
    assert parsed.skills[2].normalized is None
    assert needs_review(parsed)


def test_skills_in_prose_use_l11_without_contact_or_employer_leakage(parser: CvParser) -> None:
    parsed = parser.parse(
        "Jane Smith\nContact: docker@example.org\nSummary\nI work with Docker and FastAPI."
    )
    assert {s.normalized for s in parsed.skills} == {"Docker", "FastAPI"}
    assert not needs_review(parsed)


def test_ambiguous_contacts_and_dates_need_review(parser: CvParser) -> None:
    parsed = parser.parse(
        "Jane Smith\na@example.com, b@example.com\nExperience\nEngineer, Acme Widgets\n"
        "2020 - 2023\nSkills: Docker"
    )
    assert parsed.contact.phone is None
    assert parsed.experiences[0].start == "2020-01"
    assert parsed.confidence["/experiences/0/start"] < 0.75
    assert needs_review(parsed)


def test_unknown_current_and_reversed_dates(parser: CvParser) -> None:
    parsed = parser.parse("Experience\nEngineer, Acme Widgets\nMarch 2024 - Feb 2020")
    assert not parsed.experiences[0].is_current
    assert parsed.experience_years is None
    assert needs_review(parsed)
    assert needs_review(parser.parse("Unstructured notes with no qualifications"))
    assert parser.parse("").skills == []


def test_missing_dates_retain_work_history_for_review(parser: CvParser) -> None:
    parsed = parser.parse(
        "Name: Jane Smith\njane@example.org\nExperience\nEngineer, Acme Widgets\n• Built APIs"
    )
    assert parsed.contact.name == "Jane Smith"
    assert parsed.experiences[0].title == "Engineer"
    assert parsed.experiences[0].company == "Acme Widgets"
    assert parsed.experiences[0].start is None
    assert parsed.experiences[0].end is None
    assert not parsed.experiences[0].is_current
    assert needs_review(parsed)


def test_overlapping_jobs_are_not_double_counted() -> None:
    entries = [
        Experience(title="A", start="2020-01", end="2022-01"),
        Experience(title="B", start="2021-01", end="2023-01"),
    ]
    assert _experience_years(entries, date(2026, 1, 1)) == 3.0
    assert _experience_years([Experience(title="Unknown")], date(2026, 1, 1)) is None


def test_multiple_table_education_entries_and_location(parser: CvParser) -> None:
    parsed = parser.parse(
        "Jane Smith\nEngineer\njane@example.org | +1-212-555-0100 | Berlin, Germany\n"
        "Education\n2020\nM.Sc. Computing, Example University\n2018\n"
        "B.Sc. Computing, Other University"
    )
    assert parsed.contact.location == "Berlin, Germany"
    assert [(e.institution, e.grad_year) for e in parsed.education] == [
        ("Example University", 2020),
        ("Other University", 2018),
    ]
    parsed = parser.parse("Education\nB.Sc. Computing\nExample University\n2018")
    assert parsed.education[0].grad_year == 2018


def test_real_model_and_every_pdf_layout_validate() -> None:
    from app.services.pdf_text import extract_text

    parser = get_cv_parser()
    assert parser.nlp.meta["name"] == "core_web_sm"
    entities = {(e.text, e.label_) for e in parser.nlp("Jane Smith works at Microsoft.").ents}
    assert ("Microsoft", "ORG") in entities
    for path in FIXTURES.glob("*.pdf"):
        parsed = parser.parse(extract_text(path.read_bytes()).text)
        jsonschema.validate(parsed.model_dump(mode="json"), load_parsed_cv_schema())
        assert parsed.skills and parsed.experiences and parsed.education
        assert all(
            "Developer" in e.title
            or "Engineer" in e.title
            or "Scientist" in e.title
            or "Lead" in e.title
            or "Tester" in e.title
            for e in parsed.experiences
        )
        # Every emitted JSON pointer resolves to an actual field, even after sorting.
        data = parsed.model_dump(mode="json")
        for pointer in parsed.confidence:
            value = data
            for part in pointer[1:].split("/"):
                value = value[int(part)] if isinstance(value, list) else value[part]


def test_l11_esco_exact_and_fuzzy_suggestions(parser: CvParser) -> None:
    from pathlib import Path

    fixture = Path(__file__).resolve().parents[2] / "ml/tests/fixtures/esco_skills_sample.csv"
    parser.normalizer = SkillNormalizer(load_esco(fixture))
    parsed = parser.parse("Skills: Python, project managment, Underwater basket weaving")
    assert parsed.skills[0].normalized == "Python"
    assert parsed.skills[0].suggestion is None
    assert parsed.skills[1].normalized is None
    assert parsed.skills[1].suggestion == "project management"
    assert parsed.skills[2].raw == "Underwater basket weaving"
    assert parsed.skills[2].suggestion is None
    assert parsed.confidence["/skills/1/normalized"] == 0.6
    data = parsed.model_dump(mode="json")
    jsonschema.validate(data, load_parsed_cv_schema())
    assert ParsedCV.model_validate(data).skills[1].suggestion == "project management"


def test_l11_embedding_suggestion_survives_parser_serialization(parser: CvParser) -> None:
    normalizer = Mock(spec=SkillNormalizer)
    normalizer.normalize_skills.return_value = [
        NormalizedSkill(
            raw="Unit Testing",
            normalized=None,
            method="embedding",
            score=0.95,
            suggestion="perform software unit testing",
        )
    ]
    parser.normalizer = normalizer
    parsed = parser.parse("Skills: Unit Testing")
    data = parsed.model_dump(mode="json")
    jsonschema.validate(data, load_parsed_cv_schema())

    assert data["schema_version"] == "1.1"
    assert data["skills"] == [
        {
            "raw": "Unit Testing",
            "normalized": None,
            "suggestion": "perform software unit testing",
        }
    ]
    assert parsed.confidence["/skills/0/normalized"] == 0.6


def test_review_policy_missing_fields_and_configured_threshold() -> None:
    parsed = ParsedCV(
        schema_version="1.0",
        source="parser",
        contact=Contact(name="Jane", email="a@b.com"),
        skills=[Skill(raw="Docker", normalized="Docker")],
        confidence={"/skills/0/normalized": 0.8},
    )
    assert not needs_review(parsed)
    assert needs_review(parsed, threshold=0.9)
    parsed.contact.email = None
    assert needs_review(parsed)
