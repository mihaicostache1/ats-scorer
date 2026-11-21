# Score explanation (L-17)

**Status:** implemented, explanation version `1.0`, returned from `model_version` `hybrid-1.2.0`. Not called by the API yet. Owner: ML/DevOps lead. User stories: US-08 (band), US-09 (understand a score).

| What | Where |
|---|---|
| Builder and templates | [ml/ats_scoring/explanation.py](../../ml/ats_scoring/explanation.py) |
| Pydantic model | [ml/ats_scoring/score_explanation.py](../../ml/ats_scoring/score_explanation.py): `ScoreExplanation` |
| JSON Schema | [ml/ats_scoring/schemas/score_explanation.schema.json](../../ml/ats_scoring/schemas/score_explanation.schema.json) |
| Example payloads (frontend mocks, F-15) | [ml/ats_scoring/schemas/examples/score_explanation/](../../ml/ats_scoring/schemas/examples/score_explanation/), written by [evaluation/explanation_examples.py](../../ml/evaluation/explanation_examples.py) |
| Band thresholds | `bands` in [weights.yaml](../../ml/ats_scoring/weights.yaml) |
| Tests | [ml/tests/test_explanation.py](../../ml/tests/test_explanation.py), and `test_no_redacted_value_reaches_the_explanation` in [test_redaction.py](../../ml/tests/test_redaction.py) |

## In one paragraph

`score()` and `score_batch()` now return an `explanation` with every score: the total and its band (strong, moderate, weak), what each component added to the total, the matched skills with the phrase the CV used for each, the missing required and nice-to-have skills, an experience statement, and a note that the score is advisory. Every sentence comes from a fixed template in `explanation.py`, never from a language model, so the same score always gets the same words. It is built only from the redacted CV, so it never contains a name, contact detail, date or gender-coded word. It is JSON-ready and meant to be stored as is in `scores.component_breakdown`.

## Use

```python
from ats_scoring import score

result = score(parsed_data, job_fields, candidate_embedding=..., job_embedding=...)
result["explanation"]          # store in scores.component_breakdown
result["explanation"]["band"]  # "strong", "moderate" or "weak", for the ranked list (US-08)
```

The other keys of the result (`total`, `components`, `weights`, `matched_skills`, `missing_skills`, `score_explanations`, `model_version`) are unchanged, so nothing that reads them breaks. `score_explanations` now uses the same sentences as the explanation.

## The payload

Shortened from [no_embedding_cv_phrases.json](../../ml/ats_scoring/schemas/examples/score_explanation/no_embedding_cv_phrases.json), the schema 1.0 fixture `full.json` against a backend job, without embeddings:

```json
{
  "explanation_version": "1.0",
  "model_version": "hybrid-1.2.0",
  "total": 73.02,
  "band": "strong",
  "summary": "Strong match. Has 3 of 4 required skills. Has 5.5 years of experience; the job asks for at least 3 years.",
  "components": [
    { "name": "skill_overlap", "label": "Skills", "score": 70.0, "weight": 0.4615, "contribution": 32.3,
      "statement": "Has 3 of 4 required skills. Has 1 of 2 nice-to-have skills." },
    { "name": "embedding_similarity", "label": "Similarity of meaning", "score": null, "weight": 0.0, "contribution": 0.0,
      "statement": "No embedding is available, so similarity of meaning is not scored." },
    "... experience_fit, title_similarity, text_similarity"
  ],
  "matched_skills": [
    { "skill": "PostgreSQL", "requirement": "required", "cv_phrase": "Postgres" },
    { "skill": "Kubernetes", "requirement": "required", "cv_phrase": "k8s" },
    "..."
  ],
  "missing_skills": { "required": ["Docker"], "preferred": ["Redis"] },
  "experience": { "status": "meets", "candidate_years": 5.5, "required_years": 3.0,
    "statement": "Has 5.5 years of experience; the job asks for at least 3 years." },
  "advisory_note": "This score is advisory and can be wrong. It compares the CV with the job description and does not reject anyone. Read the CV before you decide."
}
```

| Field | Meaning |
|---|---|
| `total`, `model_version` | The same as the score's. Compare scores only within one `model_version` |
| `band` | From the thresholds in `weights.yaml` (see [Bands](#bands)) |
| `summary` | Band, then the first skills sentence (required skills when the job lists any), then experience |
| `components` | Always the five components, in the scorer's order. `score` is `null` when the part could not be computed, never 0 for that reason. `weight` is the share actually applied: 0 for a missing part, whose share goes to the others. `contribution` is `score × weight`, the points it added; the five add up to `total`, give or take 0.05 of rounding |
| `matched_skills` | Required skills first, then nice-to-have ones, each in the job's order. `skill` is the job's spelling, `cv_phrase` the CV's (the first one, when the CV lists the same skill twice) |
| `missing_skills` | `required` and `preferred` (nice-to-have), in the job's spelling |
| `experience.status` | `meets` or `below` (scored), `not_required` (the job gives no minimum, or 0), `unknown` (the CV gives no total years) |
| `advisory_note` | Show it with the score (US-09) |

Field names follow the API (`preferred` for `preferred_skills`); the texts say "nice-to-have", as the job form does.

### Where `cv_phrase` comes from

The scorer matches skills on the CV's `skills` list, so `cv_phrase` is the `raw` text of the skill entry that matched, after redaction. When a CV has no skills section, the parser fills that list from the summary and experience text with `extract_skills()` (L-11), and `raw` is the phrase as written there.

`extract_skills()` now also returns where it found each phrase: `start` and `end`, with `text[start:end] == raw`. The parsed-CV schema has no field for them yet, so they are not stored. If the frontend wants to highlight the phrase in the CV, the parser can store them in a later schema version. The explanation itself carries no position: positions in the redacted text would not match the CV the recruiter sees.

## Bands

| Band | Total | Rated "strong fit" (3) | "Good fit" (2) | "Weak fit" (1) | "No fit" (0) |
|---|---|---|---|---|---|
| strong | 60 and above | 16 | 0 | 2 | 0 |
| moderate | 40 to 59.99 | 1 | 6 | 4 | 1 |
| weak | below 40 | 1 | 2 | 7 | 20 |

Counts are the 60 rated evaluation pairs (one rater) under `hybrid-1.2.0`, whose totals are the same as `hybrid-1.1.0`. The thresholds were read off this table, so it is not an independent check: with 60 pairs and one rater, treat them as a starting point. The band is advisory, like the score: nothing is hidden or rejected because of it (US-08). Changing a threshold changes the output for the same input, so it needs a new `model_version`.

## Templates only

Every text is a `str.format` template in `TEMPLATES` (`explanation.py`), filled in with numbers, skill names and the closest job title from the redacted CV. A new situation gets a new template there. A test checks that every text in the 270 explanations of the evaluation set and in the examples is made of these templates and nothing else.

## Never a redacted field

The explanation is built after `redact()`, from the same redacted record the scorer reads: skill phrases, the closest job title and the total years of experience. The tests check this with a CV that has identity details in every field, including inside a matched skill entry. The schema is closed (`additionalProperties: false`), so a field such as `contact` cannot be added without a new version.

## Example payloads for the frontend (F-15)

| File | Shows |
|---|---|
| `strong.json`, `moderate.json`, `weak.json` | Evaluation pairs C021, C031, C009 against J01, with embeddings |
| `no_embedding_cv_phrases.json` | No embeddings (the component is `null`), CV phrases that differ from the job's ("Postgres", "k8s") |
| `job_without_skills_or_minimum.json` | No skills and no minimum experience on the job |

They are what the scorer returns, not hand-written: `python evaluation/explanation_examples.py` rewrites them, and a test fails when they are out of date. In Python: `ats_scoring.schema.load_score_explanation_example(name)`.

## Changing the explanation

- A new optional field, a new enum value or a new template that older readers can ignore: still breaks the closed schema, so bump `explanation_version` (1.1), update the JSON Schema and the model together, and rerun the example script.
- Renaming or removing a field: a new major version (2.0) and a note to the backend and frontend developers, as stored explanations keep their version.
- Changing a template's wording: no version bump, but rerun the example script.

## Follow-ups for the API contract

- `docs/openapi.yaml` still describes the older `component_breakdown` (`matched_skills`, `missing_skills`, `weights`, `explanations`). When scoring is wired in, the backend and frontend developers should replace it with this schema and run `npm run gen:api`.
- The ranked list (US-08) needs `band` per candidate. It can be read from `component_breakdown`, or stored in its own column if the list needs to filter on it.
