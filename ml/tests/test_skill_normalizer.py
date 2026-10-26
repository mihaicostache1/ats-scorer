"""Tests for skill normalization and extraction, including the failures found in L-6.

Most tests use a small extract of ESCO in tests/fixtures. The tests marked `real_esco`
use the full download and are skipped without it (see docs/ml/skill-normalization.md).
"""

import os
import random
import time
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

from ats_scoring.esco import ESCO_ATTRIBUTION, load_esco
from ats_scoring.parsed_cv import ParsedCV
from ats_scoring.skill_normalizer import (
    ALIASES,
    ESCO_SKILLS_ENV,
    NormalizedSkill,
    SkillNormalizer,
    default_normalizer,
    extract_skills,
    normalize_skills,
)
from ats_scoring.skills import SKILL_ALIASES, clean_skill

FIXTURES = Path(__file__).parent / "fixtures"
ESCO_SAMPLE = FIXTURES / "esco_skills_sample.csv"
ESCO_SAMPLE_RO = FIXTURES / "esco_skills_sample_ro.csv"

URI = "http://data.europa.eu/esco/skill/"
JAVASCRIPT = URI + "3cd569a2-4f88-4c1e-9995-8dce8c5e51a7"
MACHINE_LEARNING = URI + "3a2d5b45-56e4-4f5a-a55a-4a4a65afdc43"
VITICULTURE = URI + "3c9fc332-97e4-409a-8c32-e81fa552e882"
UNIT_TESTING = URI + "7961413f-61d0-4722-9cd9-20a050a29899"


@pytest.fixture(scope="module")
def normalizer() -> SkillNormalizer:
    return SkillNormalizer(load_esco(ESCO_SAMPLE))


def one(normalizer: SkillNormalizer, skill: str) -> NormalizedSkill:
    [result] = normalizer.normalize_skills([skill])
    return result


# --- Accepted matches: alias table and exact ESCO labels -------------------------------


@pytest.mark.parametrize(
    ("raw", "normalized", "method", "esco_label"),
    [
        ("JavaScript", "JavaScript", "exact", "JavaScript"),
        ("javascript", "JavaScript", "exact", "JavaScript"),
        ("java script", "JavaScript", "exact", "JavaScript"),  # hidden label -> preferred name
        ("Java", "Java", "exact", "Java (computer programming)"),
        ("Python", "Python", "exact", "Python (computer programming)"),
        ("Python (computer programming)", "Python", "exact", "Python (computer programming)"),
        ("machine learning", "machine learning", "exact", "machine learning"),
        ("SQL", "SQL", "exact", "SQL"),
        ("C#", "C#", "exact", "C#"),
        ("C++", "C++", "exact", "C++"),
        ("R", "R", "exact", "R"),
        ("Communication", "communication", "exact", "communication"),
        ("cooperate", "cooperate", "exact", "work in teams"),  # alternative label is kept
        ("ability to work in a team", "work in teams", "exact", "work in teams"),  # hidden
        ("Postgres", "PostgreSQL", "alias", "PostgreSQL"),
        ("C Sharp", "C#", "alias", "C#"),
        ("TS", "TypeScript", "alias", "TypeScript"),
        ("python3", "Python", "alias", "Python (computer programming)"),
        ("Jira", "Jira", "alias", "ICT project management methodologies"),
        ("k8s", "Kubernetes", "alias", None),
        ("FastAPI", "FastAPI", "alias", None),
        ("natural language processing", "natural language processing", "alias", None),
    ],
)
def test_accepted_matches(
    normalizer: SkillNormalizer,
    raw: str,
    normalized: str,
    method: str,
    esco_label: str | None,
) -> None:
    result = one(normalizer, raw)

    assert (result.normalized, result.method, result.esco_label) == (
        normalized,
        method,
        esco_label,
    )
    assert result.score == 1.0
    assert result.suggestion is None
    assert result.accepted


def test_c_family_languages_stay_distinct(normalizer: SkillNormalizer) -> None:
    uris = {result.esco_uri for result in normalizer.normalize_skills(["C#", "C++", "R"])}
    assert len(uris) == 3


# --- The failures documented in L-6 ----------------------------------------------------


def test_js_is_javascript_not_jsss(normalizer: SkillNormalizer) -> None:
    result = one(normalizer, "JS")

    assert result.normalized == "JavaScript"
    assert result.esco_uri == JAVASCRIPT
    assert result.method == "alias"


def test_ml_is_machine_learning_not_the_ml_language(normalizer: SkillNormalizer) -> None:
    # ESCO's exact match for "ML" is "ML (computer programming)". The alias runs first.
    result = one(normalizer, "ML")

    assert result.normalized == "machine learning"
    assert result.esco_uri == MACHINE_LEARNING


@pytest.mark.parametrize("raw", ["Docker", "k8s", "Kubernetes", "Playwright"])
def test_tech_terms_missing_from_esco_are_not_forced_onto_a_concept(
    normalizer: SkillNormalizer, raw: str
) -> None:
    # L-6: embeddings suggested "dock operations" and "work with playwrights".
    result = one(normalizer, raw)

    assert result.accepted
    assert result.esco_uri is None
    assert result.suggestion is None


@pytest.mark.parametrize(
    ("raw", "broad_concept"),
    [("React", "JavaScript Framework"), ("Scrum", "ICT project management methodologies")],
)
def test_broad_esco_concepts_keep_the_original_name(
    normalizer: SkillNormalizer, raw: str, broad_concept: str
) -> None:
    result = one(normalizer, raw)

    assert result.normalized == raw
    assert result.esco_label == broad_concept


def test_video_production_is_only_a_suggestion_of_viticulture(normalizer: SkillNormalizer) -> None:
    # Fuzzy score 90.3 against "vine production", an alternative label of viticulture.
    result = one(normalizer, "Video Production")

    assert result.method == "fuzzy"
    assert result.normalized is None
    assert not result.accepted
    assert result.esco_uri == VITICULTURE
    assert result.suggestion == "vine production"
    assert result.score == pytest.approx(0.903, abs=0.001)


def test_skills_in_other_languages_stay_unmatched_without_that_language(
    normalizer: SkillNormalizer,
) -> None:
    for raw in ["Teamfähigkeit", "învățare automată"]:
        result = one(normalizer, raw)
        assert (result.method, result.normalized, result.suggestion) == ("none", None, None)


def test_a_second_language_file_matches_and_shows_the_main_language() -> None:
    normalizer = SkillNormalizer(load_esco(ESCO_SAMPLE, ESCO_SAMPLE_RO))
    result = one(normalizer, "Învățare automată")

    assert result.normalized == "machine learning"
    assert result.esco_uri == MACHINE_LEARNING
    assert result.method == "exact"


# --- Fuzzy suggestions -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "suggestion"),
    [
        ("project managment", "project management"),
        ("Javascrpt", "JavaScript"),
        ("comunication", "communication"),
    ],
)
def test_typos_get_a_fuzzy_suggestion(
    normalizer: SkillNormalizer, raw: str, suggestion: str
) -> None:
    result = one(normalizer, raw)

    assert result.method == "fuzzy"
    assert result.suggestion == suggestion
    assert result.normalized is None
    assert 0.9 <= (result.score or 0) < 1


@pytest.mark.parametrize("raw", ["Jav", "Pyhton", "Unit Testing", "Underwater basket weaving"])
def test_weak_or_short_strings_stay_free_text(normalizer: SkillNormalizer, raw: str) -> None:
    # "Jav" is too short to try, "Pyhton" scores 83 and "Unit Testing" 75: under the cut-off.
    result = one(normalizer, raw)

    assert result.method == "none"
    assert result.score is None
    assert result.to_parsed_cv() == {"raw": raw, "normalized": None}


# --- Embedding suggestions -------------------------------------------------------------


class FakeEmbedder:
    """Maps known phrases to fixed unit vectors. Everything else is a zero vector."""

    name = "fake"
    VECTORS = {
        "perform software unit testing": [1.0, 0.0, 0.0],
        "unit testing": [1.0, 0.0, 0.0],
        "unit test writing": [0.8, 0.6, 0.0],  # cosine 0.8 with the label: under 0.9
        "dock operations": [0.0, 1.0, 0.0],
        "docker": [0.0, 1.0, 0.0],
        "work with playwrights": [0.0, 0.0, 1.0],
        "playwright": [0.0, 0.0, 1.0],
        "perform video editing": [0.6, 0.0, 0.8],
        "video production": [0.6, 0.0, 0.8],
    }

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def encode(self, texts: Sequence[str]) -> NDArray[np.float32]:
        self.calls.append(list(texts))
        return np.array(
            [self.VECTORS.get(text.casefold(), [0.0, 0.0, 0.0]) for text in texts],
            dtype=np.float32,
        )


def test_embedding_match_is_a_suggestion() -> None:
    # L-6: e5-small picked "test electronic units" for "Unit Testing" at 0.93. Whatever
    # the model returns, it must not be accepted automatically.
    normalizer = SkillNormalizer(load_esco(ESCO_SAMPLE), embedder=FakeEmbedder())
    result = one(normalizer, "Unit Testing")

    assert result.method == "embedding"
    assert result.normalized is None
    assert result.suggestion == "perform software unit testing"
    assert result.esco_uri == UNIT_TESTING
    assert result.score == pytest.approx(1.0)


def test_embedding_match_under_the_threshold_is_dropped() -> None:
    normalizer = SkillNormalizer(load_esco(ESCO_SAMPLE), embedder=FakeEmbedder())

    assert one(normalizer, "unit test writing").method == "none"


def test_alias_and_fuzzy_run_before_the_embedding_model() -> None:
    embedder = FakeEmbedder()
    normalizer = SkillNormalizer(load_esco(ESCO_SAMPLE), embedder=embedder)
    results = normalizer.normalize_skills(["Docker", "Playwright", "Video Production"])

    assert [result.method for result in results] == ["alias", "alias", "fuzzy"]
    assert embedder.calls == []  # nothing was left for the model, not even the ESCO labels


def test_label_embeddings_are_computed_once_and_cached(tmp_path: Path) -> None:
    cache = tmp_path / "esco_fake.npy"
    first = FakeEmbedder()
    normalizer = SkillNormalizer(
        load_esco(ESCO_SAMPLE), embedder=first, label_embeddings_cache=cache
    )
    normalizer.normalize_skills(["Unit Testing", "something else entirely"])
    normalizer.normalize_skills(["unit testing again, but unknown"])

    assert cache.is_file()
    assert len(first.calls) == 3  # labels once, then one batch per call

    second = FakeEmbedder()
    reloaded = SkillNormalizer(
        load_esco(ESCO_SAMPLE), embedder=second, label_embeddings_cache=cache
    )
    assert one(reloaded, "Unit Testing").method == "embedding"
    assert second.calls == [["unit testing"]]  # the labels came from the cache


# --- Input handling --------------------------------------------------------------------


def test_raw_keeps_what_was_written(normalizer: SkillNormalizer) -> None:
    results = normalizer.normalize_skills(["- Python.", "  sql  ", "JS"])

    assert [result.raw for result in results] == ["- Python.", "sql", "JS"]
    assert [result.normalized for result in results] == ["Python", "SQL", "JavaScript"]


def test_one_result_per_text_input_in_order(normalizer: SkillNormalizer) -> None:
    results = normalizer.normalize_skills(["Python", None, 3, "", "  ", "• ", "python", "JS"])

    assert [result.raw for result in results] == ["Python", "python", "JS"]


def test_repeated_calls_give_the_same_result(normalizer: SkillNormalizer) -> None:
    first = normalizer.normalize_skills(["Video Production", "JS", "unknown skill"])
    second = normalizer.normalize_skills(["Video Production", "JS", "unknown skill"])

    assert first == second


def test_without_esco_only_the_alias_table_is_used() -> None:
    results = SkillNormalizer().normalize_skills(["JS", "Docker", "project managment"])

    assert [result.normalized for result in results] == ["JavaScript", "Docker", None]
    assert all(result.esco_uri is None for result in results)
    assert results[2].method == "none"


def test_output_fits_the_parsed_cv_schema(normalizer: SkillNormalizer) -> None:
    skills = normalizer.normalize_skills(["JS", "Video Production", "Docker"])
    record = {
        "schema_version": "1.0",
        "source": "parser",
        "skills": [skill.to_parsed_cv() for skill in skills],
    }

    ParsedCV.model_validate(record)


def test_aliases_agree_with_the_scorer() -> None:
    # The scorer keeps its own smaller table (changing it changes scores). They must not
    # disagree where both have an entry.
    for key, target in SKILL_ALIASES.items():
        assert clean_skill(ALIASES[key]) == target, key


def test_module_functions_use_the_esco_files_in_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(ESCO_SKILLS_ENV, str(ESCO_SAMPLE))
    default_normalizer.cache_clear()
    try:
        assert normalize_skills(["JS"])[0].esco_uri == JAVASCRIPT
        assert [skill.normalized for skill in extract_skills("Uses JS daily")] == ["JavaScript"]
    finally:
        default_normalizer.cache_clear()


# --- Extraction from free text ---------------------------------------------------------


def names(skills: list[NormalizedSkill]) -> list[str | None]:
    return [skill.normalized for skill in skills]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "Built REST services in Python and FastAPI, deployed on k8s with Docker.",
            ["Python", "FastAPI", "Kubernetes", "Docker"],
        ),
        (
            "Strong background in machine learning and project management.",
            ["machine learning", "project management"],
        ),
        ("Backend services in Go and C#.", ["Go", "C#"]),
        ("Frontend in TypeScript, C++ tooling and CI/CD.", ["TypeScript", "C++", "CI/CD"]),
        ("APIs in Node.js", ["Node.js"]),
        ("Java and Python", ["Java", "Python"]),
        ("I go to the office early and grab a java.", []),
        ("Each node in the graph has a parent.", []),
        ("Python, python and PYTHON", ["Python"]),
        ("worked on project managment", []),  # typos are not guessed in free text
        ("", []),
    ],
)
def test_extract_skills(normalizer: SkillNormalizer, text: str, expected: list[str]) -> None:
    assert names(normalizer.extract_skills(text)) == expected


def test_extracted_raw_is_the_phrase_as_written(normalizer: SkillNormalizer) -> None:
    [skill] = normalizer.extract_skills("Deployed on k8s nightly")

    assert skill.raw == "k8s"
    assert skill.normalized == "Kubernetes"


def test_extraction_spans_line_breaks(normalizer: SkillNormalizer) -> None:
    assert names(normalizer.extract_skills("Machine\nlearning")) == ["machine learning"]


def test_extracted_skills_are_all_accepted(normalizer: SkillNormalizer) -> None:
    text = "JS, Docker, Scrum, React, communication and a bit of Video Production"
    skills = normalizer.extract_skills(text)

    assert names(skills) == ["JavaScript", "Docker", "Scrum", "React", "communication"]
    assert all(skill.method in ("alias", "exact") for skill in skills)


# --- ESCO loading ----------------------------------------------------------------------


def test_load_esco_skips_duplicate_rows() -> None:
    esco = load_esco(ESCO_SAMPLE)

    assert len(esco.concepts) == 24  # SQL is listed twice
    assert len({concept.uri for concept in esco.concepts}) == 24


def test_load_esco_ignores_concepts_only_in_a_later_file() -> None:
    esco = load_esco(ESCO_SAMPLE, ESCO_SAMPLE_RO)

    assert len(esco.concepts) == 24
    assert esco.lookup("concept only in this file") is None


def test_load_esco_rejects_other_files(tmp_path: Path) -> None:
    path = tmp_path / "occupations.csv"
    path.write_text("uri,label\nx,y\n", encoding="utf-8")

    with pytest.raises(ValueError, match="does not look like ESCO"):
        load_esco(path)
    with pytest.raises(ValueError):
        load_esco()


def test_attribution_names_the_licence() -> None:
    assert "CC BY 4.0" in ESCO_ATTRIBUTION
    assert "European Union" in ESCO_ATTRIBUTION


# --- Speed -----------------------------------------------------------------------------


def skill_strings(count: int, seed: int = 7) -> list[str]:
    """Distinct, mostly unknown strings, so every one reaches the fuzzy step: the worst case."""
    rng = random.Random(seed)
    known = sorted({*ALIASES, *ALIASES.values(), "project management", "communication"})
    strings: dict[str, None] = {}
    while len(strings) < count:
        word = rng.choice(known)
        cut = rng.randrange(len(word))
        strings[word[:cut] + word[cut + 1 :] + rng.choice(["", " dev", " skills", "ing"])] = None
    return list(strings)


def test_1000_skills_with_the_sample_are_fast(normalizer: SkillNormalizer) -> None:
    fresh = SkillNormalizer(normalizer.esco)
    started = time.perf_counter()
    results = fresh.normalize_skills(skill_strings(1000))

    assert len(results) == 1000
    assert time.perf_counter() - started < 2


def _real_esco_path() -> Path | None:
    configured = os.environ.get(ESCO_SKILLS_ENV, "").split(os.pathsep)[0]
    default = Path(__file__).parents[1] / "embedding_spike" / "data" / "skills_en.csv"
    for path in (Path(configured) if configured else None, default):
        if path is not None and path.is_file():
            return path
    return None


REAL_ESCO = _real_esco_path()
real_esco = pytest.mark.skipif(REAL_ESCO is None, reason="ESCO skills_en.csv not downloaded")


@pytest.fixture(scope="module")
def full_normalizer() -> SkillNormalizer:
    assert REAL_ESCO is not None
    return SkillNormalizer(load_esco(REAL_ESCO))


@real_esco
def test_1000_skills_against_full_esco_take_a_few_seconds(
    full_normalizer: SkillNormalizer,
) -> None:
    fresh = SkillNormalizer(full_normalizer.esco)  # empty cache
    started = time.perf_counter()
    fresh.normalize_skills(skill_strings(1000))

    assert time.perf_counter() - started < 5


@real_esco
def test_l6_failures_against_full_esco(full_normalizer: SkillNormalizer) -> None:
    by_raw = {
        result.raw: result
        for result in full_normalizer.normalize_skills(
            ["JS", "ML", "Docker", "k8s", "React", "Video Production", "Playwright"]
        )
    }

    assert by_raw["JS"].esco_uri == JAVASCRIPT
    assert by_raw["ML"].esco_uri == MACHINE_LEARNING
    assert by_raw["Docker"].esco_uri is None
    assert by_raw["k8s"].esco_uri is None
    assert by_raw["React"].normalized == "React"
    assert not by_raw["Video Production"].accepted
    assert by_raw["Playwright"].normalized == "Playwright"
    assert by_raw["Playwright"].esco_label != "work with playwrights"
