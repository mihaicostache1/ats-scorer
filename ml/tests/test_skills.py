"""Tests for skill normalization and matching."""

import pytest

from ats_scoring.skills import match_skills, normalize_skill


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  JavaScript ", "javascript"),
        ("JS", "javascript"),
        ("Postgres", "postgresql"),
        ("Machine   Learning", "machine learning"),
        ("ML", "machine learning"),
        ("- Python.", "python"),
        ("C++", "c++"),
        ("C#", "c#"),
        ("Node.JS", "node.js"),
        ("CI/CD", "ci/cd"),
    ],
)
def test_normalize_skill(raw: str, expected: str) -> None:
    assert normalize_skill(raw) == expected


def test_c_family_languages_stay_distinct() -> None:
    match = match_skills(["C"], ["C", "C++", "C#"], [])

    assert match.matched == ["C"]
    assert match.missing == ["C++", "C#"]


def test_duplicates_and_case_are_ignored() -> None:
    match = match_skills(["PYTHON", "python"], ["Python", "python", "SQL"], [])

    assert match.matched == ["Python"]
    assert match.missing == ["SQL"]
    assert match.overlap == 0.5


def test_preferred_skills_count_half() -> None:
    match = match_skills(["Docker"], ["Python"], ["python", "Docker"])

    # "python" is already required, so only Docker is optional: 0.5 earned of 1.5 possible.
    assert match.matched == ["Docker"]
    assert match.missing == ["Python"]
    assert match.overlap == pytest.approx(1 / 3)


def test_job_without_skills_has_no_overlap() -> None:
    assert match_skills(["Python"], [], None).overlap is None


def test_values_that_are_not_text_are_ignored() -> None:
    match = match_skills(["Python", None, 3, "  "], ["Python"], "Docker")

    assert match.matched == ["Python"]
    assert match.overlap == 1.0
