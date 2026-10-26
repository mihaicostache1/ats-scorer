# Skill normalization

**Status:** implemented, not yet used by the parser. Owner: ML/DevOps lead. Used by B-13 (CV parser). The design comes from the L-6 decision in [embedding-model-and-skill-matching.md](embedding-model-and-skill-matching.md).

| What | Where |
|---|---|
| Code | [ml/ats_scoring/skill_normalizer.py](../../ml/ats_scoring/skill_normalizer.py), [ml/ats_scoring/esco.py](../../ml/ats_scoring/esco.py) |
| Tests | [ml/tests/test_skill_normalizer.py](../../ml/tests/test_skill_normalizer.py) |
| Speed measurement | [ml/benchmarks/time_skill_normalization.py](../../ml/benchmarks/time_skill_normalization.py) |

## What it does

`normalize_skills(skills)` takes the skill strings from a CV and returns, for each one, a canonical name and the matching ESCO concept. `extract_skills(text)` finds known skills in free text, such as a summary or the bullets of a job.

For each skill the first step that succeeds wins:

| Step | Example | Result |
|---|---|---|
| 1. Clean | `" - Node.JS."` → `node.js` | Unicode form, lower case, spacing, bullets and trailing punctuation. Keeps `#`, `+`, `.`, `/` |
| 2. Alias table | `JS` → JavaScript, `k8s` → Kubernetes, `Docker` → Docker | **Accepted.** `method: "alias"` |
| 3. Exact ESCO label | `Python` → Python (computer programming) | **Accepted.** `method: "exact"` |
| 4. Fuzzy (rapidfuzz, 90/100 or more, strings of 4+ characters) | `project managment` → project management | **Suggestion only.** `method: "fuzzy"` |
| 5. Embedding (cosine 0.90 or more, optional) | `Unit Testing` → perform software unit testing | **Suggestion only.** `method: "embedding"` |
| 6. Nothing found | `Underwater basket weaving` | Free text. `method: "none"` |

Fuzzy and embedding matches are never accepted automatically, because L-6 found too many wrong ones ("Video Production" → viticulture, "Playwright" → work with playwrights). They fill `suggestion` for the recruiter to confirm on the review screen (US-05), and `normalized` stays `null`.

The alias table holds abbreviations and the tech terms that ESCO lacks or files under a broad concept (Docker, Kubernetes, FastAPI, React, Scrum). It runs before ESCO, which also fixes ESCO's own wrong exact match for "ML" (a programming language).

## Install

```bash
pip install -e ml/                    # steps 1-4: numpy and rapidfuzz
pip install -e "ml/[embeddings]"      # step 5 too: sentence-transformers and PyTorch, about 2 GB
```

## Use (B-13)

Build one normalizer when the worker starts and reuse it. Loading and indexing ESCO is the slow part of setup, and embedding its labels takes minutes the first time (then cached on disk).

```python
from ats_scoring.esco import load_esco
from ats_scoring.skill_normalizer import SkillNormalizer

normalizer = SkillNormalizer(load_esco("/data/esco/skills_en.csv"))

skills = normalizer.normalize_skills(["JS", "Docker", "project managment"])
parsed_data["skills"] = [skill.to_parsed_cv() for skill in skills]
# [{"raw": "JS", "normalized": "JavaScript"},
#  {"raw": "Docker", "normalized": "Docker"},
#  {"raw": "project managment", "normalized": None}]   # suggestion: "project management"

found = normalizer.extract_skills(parsed_data["summary"] or "")
```

With embedding suggestions:

```python
from pathlib import Path
from ats_scoring.skill_normalizer import SentenceTransformerEmbedder, SkillNormalizer

normalizer = SkillNormalizer(
    load_esco("/data/esco/skills_en.csv"),
    embedder=SentenceTransformerEmbedder(),               # multilingual-e5-small, as for CVs
    label_embeddings_cache=Path("/data/esco/labels_e5_small.npy"),
)
```

There are also module-level `normalize_skills(skills)` and `extract_skills(text)`. They use a shared normalizer built from the files in the `ESCO_SKILLS_CSV` environment variable (several files separated by `;` on Windows and `:` elsewhere). Without the variable they use the alias table only.

### What a result contains

`NormalizedSkill`:

| Field | Meaning |
|---|---|
| `raw` | The string as given, without outer spaces. For `extract_skills`, the phrase as written in the text |
| `normalized` | Canonical name, set only by the alias table or an exact ESCO match. Otherwise `None` |
| `method` | `alias`, `exact`, `fuzzy`, `embedding` or `none` |
| `score` | 0-1: `1.0` for alias and exact, the fuzzy ratio divided by 100, or the cosine. `None` for `none` |
| `esco_uri`, `esco_label` | The ESCO concept that was matched or suggested, and its preferred label. `None` when there is none, for example for Docker |
| `suggestion` | The name to offer the recruiter, for `fuzzy` and `embedding` |
| `accepted` | `normalized is not None` |
| `to_parsed_cv()` | `{"raw", "normalized"}`, the `skills[]` entry of the [parsed-CV schema](parsed-cv-schema.md) |

**Names:** an exact match shows the label that matched, as ESCO spells it, without the bracketed qualifier. An alternative label is kept, because ESCO lists narrower terms there: "Scrum" stays "Scrum", with `esco_label` "ICT project management methodologies". A hidden label (misspellings, old names) and a label from another language show the concept's preferred name instead.

**Rules for `normalize_skills`:** one result per input string, in order. Entries that are not text or are empty after cleaning are dropped. Duplicates are kept, so remove them yourself if the parser finds the same skill twice. Results are cached per cleaned string.

**Rules for `extract_skills`:** it looks for alias-table entries and ESCO preferred labels, longest phrase first (up to 6 words), and returns each skill once in order of first mention. Only accepted matches come back, because guessing at every phrase of a text would mostly produce noise. Single words that are also everyday English (`go`, `node`, `react`, `swift`, two-letter words, and ESCO names that need a qualifier, such as `Java (computer programming)`) count only when capitalized: "Go" and "Java" do, "go to" and "a java" do not.

## ESCO data

ESCO is not in the repository. Download it once:

1. Open <https://esco.ec.europa.eu/en/use-esco/download>.
2. Choose version **v1.2.1**, content **classification**, language **en**, file type **CSV**. Enter an email address; the link arrives by email.
3. Unzip it and keep `skills_en.csv`. For the tests and the benchmark, copy it to `ml/embedding_spike/data/skills_en.csv` (git-ignored), or set `ESCO_SKILLS_CSV` to its path.

For other languages, download the same file in that language and pass it after the English one: `load_esco("skills_en.csv", "skills_ro.csv")`. The extra labels match CVs in that language, and the result still shows the English name. L-6 found that the embedding model alone does not do this reliably.

### Licence and attribution

ESCO is © European Union and published under **[Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)**, per the [ESCO copyright notice](https://esco.ec.europa.eu/en/copyright-notice-esco-skills-competences). This allows commercial use, copying and changes, provided that:

- **Credit is given** wherever ESCO content reaches a user. The text is in `ats_scoring.esco.ESCO_ATTRIBUTION`. The review screen (F-11) shows ESCO names and suggestions, so it needs this credit, for example in a footnote or on an "about" page.
- **Changes are indicated.** We clean labels and strip qualifiers for matching. The credit text says so.
- **No endorsement is implied,** and the EU's logos and the ESCO name are not used as our branding. The Commission's reuse policy does not cover trade marks and logos.

Points to check before a public release:

- The notice says parts of the **transversal skills hierarchy** come from the Bertelsmann Stiftung's Kompetenz- und Berufekarten, under **CC BY-SA 4.0** (share-alike). We load only the skill concepts and their labels from `skills_en.csv`, not the hierarchy files. It is not clear from the notice whether the transversal skill labels themselves fall under the BY-SA part. If they do, share-alike applies to anything we redistribute that contains them.
- The skill hierarchy also draws on O*NET (CC BY 4.0, O*NET® is a U.S. Department of Labor trade mark). We do not use the hierarchy.
- The test fixture `ml/tests/fixtures/esco_skills_sample.csv` is a trimmed copy of 24 ESCO concepts, credited in that folder's README.

## Speed

Target: 1,000 skill strings in a few seconds without the embedding step.

```bash
cd ml
python benchmarks/time_skill_normalization.py --esco embedding_spike/data/skills_en.csv
python benchmarks/time_skill_normalization.py --esco embedding_spike/data/skills_en.csv --embeddings
```

The benchmark uses 1,000 distinct, mostly misspelled strings, so every one reaches the fuzzy step: the worst case. `test_1000_skills_against_full_esco_take_a_few_seconds` fails above 5 seconds. It runs only where the ESCO file is present, so not in CI.

Fuzzy matching compares each string with about 100,000 ESCO labels, in parallel (`rapidfuzz.process.cdist`, all CPU cores), in blocks of 64 strings to bound memory. A real CV repeats common skills, and most resolve at steps 2 and 3 without fuzzy matching.

<!-- Measured results go here: machine, seconds for 1,000 strings, with and without --embeddings. -->

## Limits

- **Coverage is the alias table's.** About 45% of our synthetic skills have no acceptable ESCO match (L-6), so the alias table does most of the work for tech skills. Add entries as real CVs show gaps, with a test for each.
- **Suggestions have no place in the parsed-CV schema 1.0.** `skills[]` holds only `raw` and `normalized`. To show suggestions on the review screen, B-13 can keep them elsewhere, or the schema gets an optional `suggestion` field in a minor version (1.1). The backend and frontend developers decide; see the schema's change rules.
- **The fuzzy and embedding thresholds are L-6's starting points,** not tuned. L-6 also found that no cosine cut-off separates right from wrong embedding matches. Tune both on recruiter-confirmed matches once F-11 records them.
- **The scorer does not use this yet.** It keeps its own smaller alias table in `ats_scoring/skills.py`, because changing that table changes scores and needs a new `MODEL_VERSION`. A test checks that the two tables agree where both have an entry.
- **Extraction is literal.** It misses inflected forms ("Dockerized") and skills written as a sentence ("I lead teams"), and a capitalized ambiguous word at the start of a sentence ("Swift delivery of ...") is a false positive.
