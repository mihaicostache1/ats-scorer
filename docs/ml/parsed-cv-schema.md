# Parsed-CV schema (draft 0.1)

**Status:** draft for the backend to review. Owner: ML/DevOps lead.

This is the proposed shape of `candidates.parsed_data`: what the CV parser writes, and what the scorer and the CV review screen read.

- JSON Schema: [ml/ats_scoring/schemas/parsed_cv.schema.json](../../ml/ats_scoring/schemas/parsed_cv.schema.json)
- Example record: [ml/ats_scoring/schemas/parsed_cv.example.json](../../ml/ats_scoring/schemas/parsed_cv.example.json)
- From Python: `from ats_scoring.schema import load_parsed_cv_schema`

## Fields

| Field | Type | Required | Read by the scorer |
|---|---|---|---|
| `schema_version` | `"0.1"` | No (see question 5) | No |
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

## How the scorer uses it

```python
from ats_scoring import score

result = score(candidate.parsed_data, job_fields)
```

`job_fields` is a dict with `title`, `description`, `required_skills` and `preferred_skills`.

| `score()` returns | Suggested place in `scores` |
|---|---|
| `total` (0-100) | `overall_score` |
| `components["skill_overlap"]` (0-100 or null) | `skill_overlap_score` |
| `components["text_similarity"]` (0-100) | `semantic_score` |
| `matched_skills`, `missing_skills` | `component_breakdown` |
| `model_version` | `model_version` |

Details of the scoring are in [ml/README.md](../../ml/README.md).

## Questions for the backend

1. **`experience_score` and `title_fit_score` are NOT NULL,** but the baseline does not compute them. Can they become nullable? Storing 0 would read as a bad result.
2. **`skill_overlap_score` can be null,** when a job lists no skills. Same question.
3. **`score()` raises `ValueError`** when a CV has no skills and no text. Proposal: catch it and put the candidate in "needs manual review" (US-08), without storing a score.
4. **`headline` and `summary`** are new compared with the example in the API spec. Is `parsed_data` the right place for them?
5. **`schema_version`** is optional in this draft so existing records still validate. Proposal: the parser always writes it, and it becomes required in version 1.0.
6. **Re-scoring:** `scores` is unique on `(application_id, model_version)`, so scoring the same application again with the same model has to update the row.
7. **Dependency:** the package needs scikit-learn. The API image installs it with `pip install -e ml/` or the equivalent line in its requirements.

The synthetic CVs from `ml/synthetic` keep `headline`, `summary` and `certifications` next to `parsed_data`, not inside it. Merge them when loading that data: `{**cv["parsed_data"], "headline": cv["headline"], "summary": cv["summary"], "certifications": cv["certifications"]}`.
