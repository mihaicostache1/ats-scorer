# Score explanation and bands (L-17, L-18)

**Status:** implemented, explanation version `1.0`, returned from `model_version` `hybrid-1.2.0`. Not called by the API yet. Owner: ML/DevOps lead. User stories: US-08 (band), US-09 (understand a score).

| What | Where |
|---|---|
| Builder and templates | [ml/ats_scoring/explanation.py](../../ml/ats_scoring/explanation.py) |
| Pydantic model | [ml/ats_scoring/score_explanation.py](../../ml/ats_scoring/score_explanation.py): `ScoreExplanation` |
| JSON Schema | [ml/ats_scoring/schemas/score_explanation.schema.json](../../ml/ats_scoring/schemas/score_explanation.schema.json) |
| Example payloads (frontend mocks, F-15) | [ml/ats_scoring/schemas/examples/score_explanation/](../../ml/ats_scoring/schemas/examples/score_explanation/), written by [evaluation/explanation_examples.py](../../ml/evaluation/explanation_examples.py) |
| Band thresholds | `bands` in [weights.yaml](../../ml/ats_scoring/weights.yaml), picked and checked in [experiments.md](experiments.md#l-18-band-thresholds) (L-18) |
| Tests | [ml/tests/test_explanation.py](../../ml/tests/test_explanation.py), and `test_no_redacted_value_reaches_the_explanation` in [test_redaction.py](../../ml/tests/test_redaction.py) |

## In one paragraph

`score()` and `score_batch()` now return an `explanation` with every score: the total and its band (strong, moderate, weak), what each component added to the total, the matched skills with the phrase the CV used for each, the missing required and nice-to-have skills, an experience statement, and a note that the score is advisory. Every sentence comes from a fixed template in `explanation.py`, never from a language model, so the same score always gets the same words. It is built only from the redacted CV, so it never contains a name, contact detail, date or gender-coded word. It is JSON-ready and meant to be stored as is in `scores.component_breakdown`.

**What the score is.** The score ranks candidates for one job, to help a recruiter decide whom to read first. It is not a probability that the candidate passes screening, and a band is not a verdict. The same total can mean a top candidate in one job and an average one in another (see [Bands](#bands)), so scores are compared only within a job.

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
  "advisory_note": "This score is advisory: it ranks candidates for this job and is not a chance of passing screening. It can be wrong and does not reject anyone. Read the CV before you decide."
}
```

| Field | Meaning |
|---|---|
| `total`, `model_version` | The same as the score's. Compare scores only within one `model_version` |
| `band` | From the thresholds in `weights.yaml` (see [Bands](#bands)) |
| `summary` | Band, then the first skills sentence (required skills when the job lists any), then experience. When the listed skills carry no weight (only nice-to-have skills, with `preferred_weight: 0`), every skills sentence is included, ending with the one that says so |
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

| Band | Total | What it means, measured on 60 rated pairs |
|---|---|---|
| `strong` | 70 and above | Rare and precise: all 5 pairs here were rated "strong fit", but only 5 of the 18 pairs rated so are here |
| `moderate` | 50 to 69.99 | Most good candidates (11 of the 18 rated "strong fit"), plus some weaker ones |
| `weak` | below 50 | Mostly "weak fit" or "no fit" (31 of 36), with an occasional good candidate the scorer misses |

The thresholds were picked on the L-9 pairs by a rule fixed beforehand and checked on the L-15 pairs (L-18): weighted kappa 0.755 on the first, 0.571 on the second. Full numbers and limits: [experiments.md](experiments.md#l-18-band-thresholds).

**The band follows the score, and the score is relative.** The median total of the candidates rated "strong fit" runs from 55 in one job to 79 in another, so a job can have no strong match at all while its best candidates are good. Bands group a ranking; they do not grade candidates across jobs. Changing a threshold changes the output for the same input, so it needs a new `model_version`.

## Bands in the UI

For the ranked list (F-14) and the score detail (F-15). Both use exactly these names, so a recruiter sees the same word everywhere.

**Names.** The API value is `strong`, `moderate` or `weak`; never rename it in code. The label is always the band plus "match", as in the explanation's `summary`:

```ts
// One shared map, used by the ranked list, its filters and the score detail.
export const BAND_LABELS = {
  strong: "Strong match",
  moderate: "Moderate match",
  weak: "Weak match",
} as const;
```

"Match" says the band describes the CV against this job, not the person. Never "strong candidate" or "weak candidate".

**Number and band together.** Show the total as a whole number with the label: `74 · Strong match`. Round **down** (`Math.floor`), so the number never shows the next band's threshold: 69.99 shows `69 · Moderate match`, not `70`. Never add `%` and never write "74% match": the score is not a percentage or a probability.

**Help text.** Next to the band (tooltip or info icon), use this text, unchanged:

> Bands group this job's candidates by score, to help you decide whom to read first. They are not a chance of passing screening, and they do not compare candidates across jobs. Read the CV before you decide.

Per band, if the UI explains each one:

| Band | Text |
|---|---|
| Strong match | Closest to this job's requirements. Read these first. |
| Moderate match | Meets part of this job's requirements. Many good candidates are here, so review them too. |
| Weak match | Few of this job's requirements found in the CV. Check the CV before deciding: it may have been parsed badly. |

**Words to avoid** anywhere near a score or band: pass, fail, qualified, unqualified, recommended, not recommended, reject, approve, likely, chance, probability, `%`, "the AI decided", best candidate, top talent, unfit. The score is a ranking aid (US-08: advisory, nothing hidden or rejected automatically).

**Layout.**

- Sort the list by score, not by band. The order within a band matters as much as the band.
- Show all three bands by default. Do not collapse or hide weak matches, and do not pre-filter to strong.
- A job with no strong match is normal (it happened on 3 of the 6 evaluated jobs). Do not show "no good candidates". If a filter on strong comes back empty: "No candidate is a strong match for this job. Moderate matches may still fit."
- Candidates without a score ("Needs manual review", US-08) have no band. Show them in their own group, never as weak.
- Do not show a score or band average across jobs, and do not compare one candidate's scores in two jobs.
- Do not use colour alone, and avoid a red / amber / green scheme: it reads as fail / pass. Use one neutral colour at three strengths, always with the text label.

**In the score detail (F-15),** show the `summary` and the `advisory_note` near the score, as returned. Do not rephrase them: they come from reviewed templates. Show the `model_version` in small print.

## Templates only

Every text is a `str.format` template in `TEMPLATES` (`explanation.py`), filled in with numbers and skill names from the redacted CV. A new situation gets a new template there. A test checks that every text in the 270 explanations of the evaluation set and in the examples is made of these templates and nothing else.

## Never a redacted field

The explanation is built after `redact()`, from the same redacted record the scorer reads: skill phrases and the total years of experience. It never quotes a job title from the CV, only the title fit score: a headline such as "Backend Engineer (DOB 04/21/92)" can carry a birth date in a form redaction does not catch, and this text is stored in `scores.component_breakdown` and shown. The tests check this with a CV that has identity details in every field, including inside a matched skill entry, and with birth dates written into the headline. The schema is closed (`additionalProperties: false`), so a field such as `contact` cannot be added without a new version.

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
