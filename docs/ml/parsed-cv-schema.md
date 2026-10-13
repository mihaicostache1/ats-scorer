# Parsed-CV schema (draft 0.1)

**Status:** draft 0.1, reviewed with the backend in the L-7 PR. Owner: ML/DevOps lead.

This is the proposed shape of `candidates.parsed_data`: what the CV parser writes, and what the scorer and the CV review screen read.

- JSON Schema: [ml/ats_scoring/schemas/parsed_cv.schema.json](../../ml/ats_scoring/schemas/parsed_cv.schema.json)
- Example record: [ml/ats_scoring/schemas/parsed_cv.example.json](../../ml/ats_scoring/schemas/parsed_cv.example.json)
- From Python: `from ats_scoring.schema import load_parsed_cv_schema`

## Fields

| Field | Type | Required | Read by the scorer |
|---|---|---|---|
| `schema_version` | one of the accepted versions, now `"0.1"` | No, but the parser always writes it | No |
| `headline` | string or null | No | Yes |
| `summary` | string or null | No | Yes |
| `skills` | list of strings | **Yes**, may be empty | Yes |
| `experience_years` | number or null | No | Not yet |
| `work_history[].title` | string | **Yes**, per entry | Yes |
| `work_history[].summary`, `.bullets` | string, list of strings | No | Yes |
| `work_history[].company` | string or null | No | No |
| `work_history[].start`, `.end` | `YYYY-MM` or null | No | No |
| `work_history[].years` | number or null | No | No |
| `education[].degree` | string | **Yes**, per entry | Yes |
| `education[].institution`, `.grad_year` | string, integer | No | No |
| `languages` | list of strings | No | No |
| `certifications` | list of strings | No | Yes |

## Rules

- **No identity data.** Name, email, phone and location stay in their own `candidates` columns and are not repeated here.
- **The scorer reads a fixed list of fields** (the "Yes" rows). Anything else in the record is ignored, which is how employer names, school names, dates and graduation years stay out of the score (US-06).
- **Skills are stored as written in the CV.** The scorer normalizes them when it compares.
- **`end: null` means the position is current.** Leave `end` out when it is unknown.
- **Extra fields are allowed,** so the parser can add data without breaking validation.
- **Old records keep validating after a version bump.** The schema lists every accepted version. A change that keeps older records valid adds its version to that list. A breaking change gets a new schema file.
- **`{}` means "not parsed yet".** It fails the schema on purpose, because `skills` is required, and it is never scored.

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
- **`headline` and `summary`** live in `parsed_data`. The API returns `parsed_data` as an opaque object for now and will validate it against this schema once users can edit it.
- **`schema_version`:** the parser always writes it, and the schema accepts a list of versions.
- **Re-scoring:** the backend upserts on `(application_id, model_version)`, and every stage move keeps a copy of the score and model version it was based on (PR #22). `MODEL_VERSION` changes whenever the weights or the alias table change.
- **`semantic_score` holds the TF-IDF similarity** for now. `model_version` tells it apart from embedding similarity later.
- **Scoring runs in the worker,** not during a request.

**Still open:**

- Where the "needs manual review" state for scoring lives. `cv_documents.status = needs_review` is about parsing (backend).
- The API image builds from `./api` and cannot see `ml/` yet (backend, separate PR).

The synthetic CVs from `ml/synthetic` keep `headline`, `summary` and `certifications` next to `parsed_data`, not inside it. Merge them when loading that data: `{**cv["parsed_data"], "headline": cv["headline"], "summary": cv["summary"], "certifications": cv["certifications"]}`.
