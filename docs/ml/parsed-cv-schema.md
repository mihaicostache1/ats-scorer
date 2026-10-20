# Parsed-CV schema (version 1.0)

**Status:** version 1.0, final once the backend and frontend developers have approved the PR (L-10). Owner: ML/DevOps lead. Used by B-13 (CV parser) and F-11 (CV review screen).

This is the shape of `candidates.parsed_data`: what the CV parser writes, what the recruiter corrects on the review screen, and what the scorer reads.

| What | Where |
|---|---|
| JSON Schema (draft 2020-12) | [ml/ats_scoring/schemas/parsed_cv.schema.json](../../ml/ats_scoring/schemas/parsed_cv.schema.json) |
| Pydantic models (Python) | [ml/ats_scoring/parsed_cv.py](../../ml/ats_scoring/parsed_cv.py): `ParsedCV` and the models inside it |
| Valid examples | [ml/ats_scoring/schemas/fixtures/valid/](../../ml/ats_scoring/schemas/fixtures/valid/) |
| Invalid examples | [ml/ats_scoring/schemas/fixtures/invalid/](../../ml/ats_scoring/schemas/fixtures/invalid/), one defect per file |
| Tests | [ml/tests/test_schema.py](../../ml/tests/test_schema.py) |

```python
from ats_scoring.parsed_cv import ParsedCV
from ats_scoring.schema import load_parsed_cv_schema, load_parsed_cv_fixture

parsed = ParsedCV.model_validate(record)               # raises pydantic.ValidationError
record = parsed.model_dump(mode="json")                # back to a plain dict for the database
schema = load_parsed_cv_schema()                       # for jsonschema, or to generate types
valid = load_parsed_cv_fixture("valid", "full")        # for tests in the backend or frontend
```

## Fields

Every object is **closed**: a field that is not listed is an error. Null means "not found in the CV". A field that is not required may be left out.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | `"1.0"` | **Yes** | See [Versions](#versions) |
| `source` | `"parser"` or `"recruiter"` | **Yes** | Who wrote this version of the record. The parser writes `parser`. When a recruiter saves a correction, the backend sets `recruiter` |
| `contact` | object | No | Defaults to an empty contact |
| `contact.name`, `.email`, `.phone`, `.location` | string or null | No | As read from the CV |
| `contact.links` | list of strings | No | Profile and portfolio URLs |
| `headline` | string or null | No | Current or most recent job title |
| `summary` | string or null | No | The candidate's own profile text |
| `skills` | list of skills | **Yes**, may be empty | |
| `skills[].raw` | string, not empty | **Yes** | The skill as written in the CV |
| `skills[].normalized` | string or null | **Yes** | Canonical name, or `null` when the skill is not recognized. The key must be present |
| `experience_years` | number or null, at least 0 | No | Total years of work experience |
| `experiences` | list | No | Most recent first |
| `experiences[].title` | string, not empty | **Yes** | |
| `experiences[].company` | string or null | No | |
| `experiences[].start`, `.end` | `YYYY-MM` or null | No | `null` means unknown |
| `experiences[].is_current` | boolean | No, default `false` | True if the candidate still holds the position. `end` is then usually `null` |
| `experiences[].summary` | string or null | No | |
| `experiences[].bullets` | list of strings | No | |
| `education[].degree` | string, not empty | **Yes**, per entry | |
| `education[].institution` | string or null | No | |
| `education[].grad_year` | integer 1950-2100 or null | No | |
| `languages[].language` | string, not empty | **Yes**, per entry | |
| `languages[].level` | string or null | No | As written: `B2`, `native`, `fluent` |
| `certifications` | list of strings | No | |
| `confidence` | object | No | See below |

### Confidence

`confidence` maps a field to a number from 0 to 1. The key is a [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) into the record:

```json
"confidence": { "/contact/email": 0.98, "/skills/3/normalized": 0.62, "/experiences/0/start": 0.7 }
```

- The review screen (F-11) highlights fields below a threshold that the frontend chooses. The schema does not fix one.
- **A field with no entry has no confidence value.** That is not the same as low confidence, and it must not be shown as a warning.
- The schema checks the form of the key and the range of the value. It does not check that the pointer leads to a field that exists. The producer keeps them in step: when it adds or removes an entry in a list, it renumbers the pointers.
- When a recruiter corrects a field, the backend sets that field's confidence to `1` and `source` to `recruiter`.

## Rules

- **The scorer reads only qualifications:** `headline`, `summary`, `skills[].raw`, `experiences[].title`, `.summary` and `.bullets`, `education[].degree` and `certifications`. Contact details, employer and school names, dates, graduation years, languages and confidence are never read, so they cannot change a score (US-06). `test_contact_and_confidence_do_not_change_the_score` checks this.
- **Contact is a copy of what the CV says,** for the review screen. The `candidates` columns `full_name`, `email`, `phone` and `location` stay the record the rest of the app uses. When the recruiter accepts the review, the backend copies the corrected values there (B-14 decides how).
- **`skills[].raw` is what the scorer compares.** `normalized` is for display and later matching. The scorer does not use it yet.
- **`end: null` is not "current".** Use `is_current` for that.
- **`{}` means "not parsed yet".** It fails the schema on purpose and is never scored.
- **Dates are `YYYY-MM`.** The schema does not check that `end` is after `start`.

## Versions

`schema_version` is `MAJOR.MINOR`, and the schema file lists the versions it accepts.

- **Minor** (1.1): a change that keeps every 1.0 record valid, for example a new optional field. Add the version to the `schema_version` list. Readers of 1.0 can ignore the new field, but note that the closed objects mean a 1.0 validator rejects 1.1 records, so the backend must validate with the schema file that matches the record's version.
- **Major** (2.0): anything else, such as renaming or removing a field or making an optional field required. It gets a new schema file, and old records are migrated or kept under the old file.

### Changing the schema after it is merged

1. Change `parsed_cv.schema.json` **and** `parsed_cv.py` together. The tests fail if they disagree.
2. Update the fixtures: add valid and invalid cases for what changed, and give every new invalid fixture its reason in `WHY_INVALID` in the test.
3. Bump `SCHEMA_VERSION` in `parsed_cv.py` and in the schema file, and add a line to the changelog below.
4. Open the PR with the **backend and frontend developers as reviewers**. The PR template has a checkbox for it. Do not merge without both approvals.
5. Announce the new version to both teams, because B-13 writes it and F-11 reads it.

### Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10 | First final version. Adds `contact`, `source`, `confidence`, `skills[].normalized`, `languages[].level`, `experiences[].is_current`. Renames `work_history` to `experiences`. Skills and languages become objects. Drops `experiences[].years`. `schema_version` is required. Objects are closed |
| 0.1 | 2026-10 | Draft from L-7. Never written by a parser |

## The draft 0.1 shape

The synthetic CVs from `ml/synthetic` and the evaluation set still use the draft shape: `work_history`, skills and languages as plain strings, and `headline`, `summary` and `certifications` kept next to `parsed_data` in the generator output. The scorer reads both shapes, so they keep working, but they do **not** validate against 1.0. Do not store them in `candidates.parsed_data` as they are. Moving the generator and `make seed` to 1.0 is a separate change.

## How the scorer uses it

```python
from ats_scoring import score

result = score(candidate.parsed_data, job_fields)
```

`job_fields` is a dict with `title`, `description`, `required_skills` and `preferred_skills`.

| `score()` returns | Place in `scores` |
|---|---|
| `total` (0-100) | `overall_score` |
| `components["skill_overlap"]` (0-100 or null) | `skill_overlap_score` |
| `components["text_similarity"]` (0-100) | `semantic_score` |
| `weights`, `matched_skills`, `missing_skills`, `score_explanations` | `component_breakdown` |
| `model_version` | `model_version` |

`experience_score` and `title_fit_score` stay null, because the baseline does not compute them. `score()` raises `NothingToScoreError`, a `ValueError` subclass, when the candidate or the job has nothing to compare.

Details of the scoring are in [ml/README.md](../../ml/README.md).

## Decisions from the L-7 review

- **Nullable components:** `experience_score`, `title_fit_score` and `skill_overlap_score` are null when a model does not compute them (backend PR #22).
- **Nothing to score:** no score is stored and the candidate goes to manual review. The backend catches `NothingToScoreError`, not every `ValueError`.
- **Re-scoring:** the backend upserts on `(application_id, model_version)`, and every stage move keeps a copy of the score and model version it was based on (PR #22). `MODEL_VERSION` changes whenever the weights or the alias table change.
- **`semantic_score` holds the TF-IDF similarity** for now. `model_version` tells it apart from embedding similarity later.
- **Scoring runs in the worker,** not during a request.

## Open

- **Review by the backend and frontend developers** is required before this is final. Record the approvals on the PR.
- **Where the "needs manual review" state for scoring lives.** `cv_documents.status = needs_review` is about parsing (backend).
- **The API image builds from `./api` and cannot see `ml/` yet** (backend, separate PR). Until then the backend can validate with the JSON Schema file, or copy `parsed_cv.py`.
- **TypeScript types for F-11.** The web app generates its types from `docs/openapi.yaml`, where `parsed_data` is still an open object. Either describe the schema there, or generate types from the JSON Schema. The frontend developer decides.
