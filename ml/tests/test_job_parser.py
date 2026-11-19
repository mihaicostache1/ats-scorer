"""Tests for job-description parsing (L-12).

The 20 synthetic jobs in tests/fixtures/jobs come from ml/synthetic/generate.py (seed 42)
and carry the expected skills, experience and seniority. The hand-written descriptions in
tests/fixtures/job_descriptions imitate real postings: markdown, capitals, prose without
sections, inline "is a plus", labels inside a paragraph.
"""

import json
from pathlib import Path

import pytest

from ats_scoring.esco import load_esco
from ats_scoring.job_parser import PARSER_VERSION, parse_job_description
from ats_scoring.skill_normalizer import SkillNormalizer
from ats_scoring.skills import clean_skill

FIXTURES = Path(__file__).parent / "fixtures"
SYNTHETIC_JOBS = sorted((FIXTURES / "jobs").glob("J*.json"))
HAND_WRITTEN = FIXTURES / "job_descriptions"


@pytest.fixture(scope="module", params=["aliases only", "ESCO sample"])
def normalizer(request: pytest.FixtureRequest) -> SkillNormalizer:
    """The alias table alone, as without $ESCO_SKILLS_CSV, and with an ESCO extract."""
    if request.param == "ESCO sample":
        return SkillNormalizer(load_esco(FIXTURES / "esco_skills_sample.csv"))
    return SkillNormalizer()


@pytest.fixture(scope="module")
def esco_normalizer() -> SkillNormalizer:
    return SkillNormalizer(load_esco(FIXTURES / "esco_skills_sample.csv"))


def keys(skills: list[str], normalizer: SkillNormalizer) -> list[str]:
    """Skills as the scorer compares them: "NLP" and "natural language processing" agree."""
    return sorted(
        clean_skill(result.normalized or result.raw)
        for result in normalizer.normalize_skills(skills)
    )


# --- The 20 synthetic jobs -------------------------------------------------------------


def test_all_synthetic_jobs_are_present() -> None:
    assert len(SYNTHETIC_JOBS) == 20


@pytest.mark.parametrize("path", SYNTHETIC_JOBS, ids=lambda path: path.stem)
def test_synthetic_job(path: Path, normalizer: SkillNormalizer) -> None:
    job = json.loads(path.read_text(encoding="utf-8"))
    parsed = parse_job_description(job["description"], title=job["title"], normalizer=normalizer)

    assert keys(parsed.required_skills, normalizer) == keys(job["required_skills"], normalizer)
    assert keys(parsed.preferred_skills, normalizer) == keys(job["preferred_skills"], normalizer)
    assert parsed.min_experience_years == job["min_experience_years"]
    assert parsed.seniority == job["seniority"]
    assert parsed.sections_detected


# --- Hand-written descriptions ---------------------------------------------------------

HAND_WRITTEN_CASES = [
    pytest.param(
        "markdown_startup.txt",
        {
            "required": ["Python", "Go", "PostgreSQL", "Redis", "AWS", "Lambda", "S3", "GCP"],
            "preferred": ["Kubernetes", "Terraform"],
            "years": 5,
            "seniority": ("senior", "title"),
            "sections": True,
        },
        id="markdown headings, Kafka only in duties, company age ignored",
    ),
    pytest.param(
        "caps_terse.txt",
        {
            "required": ["Spark", "Airflow", "dbt", "SQL", "Python", "Snowflake", "BigQuery"],
            "preferred": ["kafka", "Terraform"],
            "years": 4,
            "seniority": ("senior", "title"),
            "sections": True,
        },
        id="capital headings, dbt both required and nice-to-have",
    ),
    pytest.param(
        "prose_no_sections.txt",
        {
            "required": ["Django", "Python", "React", "AWS", "SQL", "Git", "Docker", "TypeScript"],
            "preferred": [],
            "years": 3,
            "seniority": ("mid", "experience"),
            "sections": False,
        },
        id="no sections: everything required, duty sentences included",
    ),
    pytest.param(
        "mixed_inline_cues.txt",
        {
            "required": ["ML", "Python", "PyTorch", "Docker", "SQL"],
            "preferred": ["TensorFlow", "Kubernetes", "Airflow"],
            "years": 3,
            "seniority": ("mid", "experience"),
            "sections": True,
        },
        id="ideally, is a plus, Required:/Preferred: in one bullet",
    ),
    pytest.param(
        "eu_profile.txt",
        {
            "required": ["Java", "Kotlin", "English"],
            "preferred": ["Dutch", "ISTQB", "Appium"],
            "years": 2,
            "seniority": ("mid", "title"),
            "sections": True,
        },
        id="your profile, desirable, is an advantage, years in words",
    ),
    pytest.param(
        "duties_only.txt",
        {
            "required": ["HubSpot", "Excel"],
            "preferred": [],
            "years": 0,
            "seniority": ("junior", "title"),
            "sections": False,
        },
        id="duties only, lead generation is not a level",
    ),
    pytest.param(
        "one_paragraph_labels.txt",
        {
            "required": ["React", "TypeScript", "Jest"],
            "preferred": ["Next.js", "Storybook"],
            "years": 3,
            "seniority": ("senior", "title"),
            "sections": True,
        },
        id="labels inside a paragraph, preferred years ignored",
    ),
]


@pytest.mark.parametrize(("name", "expected"), HAND_WRITTEN_CASES)
def test_hand_written_job(
    name: str, expected: dict[str, object], esco_normalizer: SkillNormalizer
) -> None:
    text = (HAND_WRITTEN / name).read_text(encoding="utf-8")
    parsed = parse_job_description(text, normalizer=esco_normalizer)

    assert parsed.required_skills == expected["required"]
    assert parsed.preferred_skills == expected["preferred"]
    assert parsed.min_experience_years == expected["years"]
    assert (parsed.seniority, parsed.seniority_source) == expected["seniority"]
    assert parsed.sections_detected is expected["sections"]


def test_at_least_five_hand_written_descriptions() -> None:
    assert len(list(HAND_WRITTEN.glob("*.txt"))) >= 5
    assert len(HAND_WRITTEN_CASES) == len(list(HAND_WRITTEN.glob("*.txt")))


# --- Sections and fallback -------------------------------------------------------------


def test_without_sections_every_skill_is_required() -> None:
    text = "We build with Python and Docker. Kubernetes knowledge helps."
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.required_skills == ["Python", "Docker", "Kubernetes"]
    assert parsed.preferred_skills == []
    assert not parsed.sections_detected


def test_a_skill_both_required_and_preferred_is_required() -> None:
    text = "Nice to have\n- Python, Go\nRequirements\n- Python"
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.required_skills == ["Python"]
    assert parsed.preferred_skills == ["Go"]


def test_duties_are_read_when_the_requirements_name_no_skill() -> None:
    text = (
        "Requirements\n- 5+ years of experience\n"
        "Responsibilities\n- Build services in Go on Kubernetes"
    )
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.required_skills == ["Go", "Kubernetes"]
    assert parsed.min_experience_years == 5


def test_company_and_benefits_text_is_ignored() -> None:
    text = "About us\nWe run on Python and Kubernetes.\nRequirements\n- Docker"
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.required_skills == ["Docker"]


def test_job_title_and_team_names_are_not_skills() -> None:
    # J15: "QA" in the title and "Quality Assurance" in the team name are aliases.
    text = (
        "Our Quality Assurance team is growing and we are looking for a Senior QA Automation "
        "Engineer. You should be confident with Java. Experience with k6 is a plus."
    )
    parsed = parse_job_description(
        text, title="Senior QA Automation Engineer", normalizer=SkillNormalizer()
    )
    assert parsed.required_skills == ["Java"]
    assert parsed.preferred_skills == ["k6"]
    assert parsed.seniority == "senior"


def test_a_bullet_is_never_taken_as_the_title() -> None:
    # Without a title, a short first line is the title, but not a bullet.
    text = "- 5+ years of experience with Python\n- Docker"
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.required_skills == ["Python", "Docker"]
    assert parsed.min_experience_years == 5


def test_a_short_first_line_without_a_bullet_is_still_the_title() -> None:
    text = "Senior Backend Engineer\nRequirements\n- Python"
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.required_skills == ["Python"]
    assert (parsed.seniority, parsed.seniority_source) == ("senior", "title")


@pytest.mark.parametrize(
    ("requirement", "skills"),
    [
        ("Python with Django", ["Python", "Django"]),
        ("Python with Django and Flask", ["Python", "Django", "Flask"]),
        ("Docker, Python in production", ["Docker", "Python"]),
    ],
)
def test_skills_after_a_preposition_are_kept(
    requirement: str, skills: list[str], normalizer: SkillNormalizer
) -> None:
    text = f"Requirements\n- {requirement}"
    assert parse_job_description(text, normalizer=normalizer).required_skills == skills


def test_empty_text() -> None:
    parsed = parse_job_description("", title="Senior Data Engineer", normalizer=SkillNormalizer())
    assert parsed.required_skills == parsed.preferred_skills == parsed.skills == []
    assert parsed.min_experience_years is None
    assert (parsed.seniority, parsed.seniority_source) == ("senior", "title")
    assert not parsed.sections_detected


# --- Experience ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("requirement", "years"),
    [
        ("5+ years of experience", 5),
        ("5+ yrs Python", 5),
        ("3-5 years of experience", 3),
        ("3 to 5 years in backend development", 3),
        ("Between 3 and 5 years of experience", 3),
        ("between three (3) and five (5) years of experience", 3),
        ("Python 3 and 2 years of Go", 2),
        ("Minimum of three years' experience", 3),
        ("At least one year of experience", 1),
        ("18 months of experience", 1),
        ("No prior experience required", 0),
        ("We were founded 20 years ago", None),
        ("2 year contract", None),
        ("Python and SQL", None),
    ],
)
def test_min_experience_years(requirement: str, years: int | None) -> None:
    text = f"Requirements\n- {requirement}"
    assert parse_job_description(text, normalizer=SkillNormalizer()).min_experience_years == years


def test_a_between_range_gives_its_lower_end_and_no_skill() -> None:
    text = "Requirements\n- Between 3 and 5 years of experience"
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert parsed.min_experience_years == 3
    assert (parsed.seniority, parsed.seniority_source) == ("mid", "experience")
    assert parsed.required_skills == []


def test_the_highest_required_minimum_wins() -> None:
    text = "Requirements\n- 5+ years of experience\n- 2+ years with Kubernetes\n- 8 years preferred"
    assert parse_job_description(text, normalizer=SkillNormalizer()).min_experience_years == 5


# --- Seniority -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("title", "seniority"),
    [
        ("Sr. Software Engineer", "senior"),
        ("Staff Software Engineer", "lead"),
        ("Head of Data", "lead"),
        ("Frontend Tech Lead", "lead"),
        ("Lead Generation Specialist", None),
        ("Graduate Analyst", "junior"),
        ("Software Engineering Intern", "junior"),
        ("Mid-level Product Designer", "mid"),
        ("Data Engineer", None),
    ],
)
def test_seniority_from_title(title: str, seniority: str | None) -> None:
    assert parse_job_description("", title=title, normalizer=SkillNormalizer()).seniority == (
        seniority
    )


def test_seniority_from_text() -> None:
    text = "We are looking for a Senior Data Engineer to join our platform team."
    parsed = parse_job_description(text, normalizer=SkillNormalizer())
    assert (parsed.seniority, parsed.seniority_source) == ("senior", "text")


@pytest.mark.parametrize(
    ("years", "seniority"), [(0, "junior"), (2, "mid"), (5, "senior"), (8, "lead")]
)
def test_seniority_from_experience(years: int, seniority: str) -> None:
    text = f"Requirements\n- {years}+ years of experience"
    parsed = parse_job_description(text, title="Platform Engineer", normalizer=SkillNormalizer())
    assert (parsed.seniority, parsed.seniority_source) == (seniority, "experience")


# --- Output format ---------------------------------------------------------------------


def test_to_dict_is_the_documented_json() -> None:
    text = "Requirements\n- JS and Docker\nNice to have\n- Kafka"
    parsed = parse_job_description(text, title="Backend Developer", normalizer=SkillNormalizer())
    assert json.loads(json.dumps(parsed.to_dict())) == {
        "required_skills": ["JS", "Docker"],
        "preferred_skills": ["Kafka"],
        "min_experience_years": None,
        "seniority": None,
        "seniority_source": None,
        "sections_detected": True,
        "skills": [
            {"raw": "JS", "normalized": "JavaScript", "requirement": "required"},
            {"raw": "Docker", "normalized": "Docker", "requirement": "required"},
            {"raw": "Kafka", "normalized": "Kafka", "requirement": "preferred"},
        ],
        "parser_version": PARSER_VERSION,
    }
