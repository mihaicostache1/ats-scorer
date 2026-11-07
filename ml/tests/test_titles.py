"""Tests for job-title similarity."""

import pytest

from ats_scoring.titles import candidate_titles, match_title, title_similarity, title_words


def test_seniority_and_filler_words_are_dropped() -> None:
    assert title_words("Head of Marketing") == {"marketing": 1.0}
    assert title_words("Sr. Backend Developer II") == {"backend": 1.0, "engineer": 0.5}
    assert title_words("Junior") == {}


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("Backend Developer", "Senior Backend Engineer"),
        ("Back-end Engineer", "Backend Engineer"),
        ("Data Analyst", "Lead Data Analyst"),
        ("Data Analyst", "Data Analytics"),
    ],
)
def test_same_role_written_differently_is_a_full_match(first: str, second: str) -> None:
    assert title_similarity(first, second) == 1.0


def test_a_shared_generic_word_counts_little() -> None:
    # Only "engineer" is shared, and it weighs half: 2 * 0.5 / (1.5 + 1.5).
    assert title_similarity("Backend Engineer", "Frontend Engineer") == pytest.approx(1 / 3)


def test_a_shared_field_counts_a_lot() -> None:
    # "marketing" is shared: 2 * 1 / (1 + 1.5).
    assert title_similarity("Marketing Assistant", "Marketing Specialist") == pytest.approx(0.8)


def test_different_fields_do_not_match() -> None:
    assert title_similarity("Data Analyst", "Product Manager") == 0.0
    assert title_similarity("", "Product Manager") == 0.0


def test_candidate_titles_reads_both_schema_shapes() -> None:
    assert candidate_titles({"headline": "A", "experiences": [{"title": "B"}, {"title": " "}]}) == [
        "A",
        "B",
    ]
    assert candidate_titles({"work_history": [{"title": "C"}, "junk"]}) == ["C"]
    assert candidate_titles({"headline": None, "experiences": None}) == []


def test_match_title_keeps_the_closest_title() -> None:
    candidate = {
        "headline": "Product Manager",
        "experiences": [{"title": "Product Manager"}, {"title": "Data Analyst"}],
    }

    match = match_title(candidate, "Senior Data Analyst", older_title_factor=0.8)

    assert match.closest_title == "Data Analyst"
    assert match.similarity == pytest.approx(0.8)


def test_without_a_headline_the_most_recent_position_counts_in_full() -> None:
    candidate = {"experiences": [{"title": "Data Analyst"}, {"title": "Data Analyst"}]}

    assert match_title(candidate, "Data Analyst", older_title_factor=0.5).similarity == 1.0


@pytest.mark.parametrize("job_title", [None, "", "Senior", 42])
def test_no_usable_job_title_gives_none(job_title: object) -> None:
    match = match_title({"headline": "Data Analyst"}, job_title, older_title_factor=0.8)

    assert match.similarity is None


def test_no_candidate_title_gives_none() -> None:
    assert match_title({"summary": "x"}, "Data Analyst", older_title_factor=0.8).similarity is None
