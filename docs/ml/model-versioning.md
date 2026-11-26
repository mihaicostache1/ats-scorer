# Model versioning and rescoring policy (L-21)

**Status:** proposed, to be agreed with the backend developer (see [To agree](#to-agree)). The `model_version` part is implemented in `ats_scoring.versioning`. The rescoring and storage rules need backend work (a B-task, not in this PR). Owner: ML/DevOps lead.

Every score is stored with the `model_version` that produced it. This page defines that string, when it changes, when scores are recomputed, and how old scores are kept.

## What `model_version` is

```
hybrid-1.2.0+w.1a2b3c4d.e.5e6f7a8b.t.9c0d1e2f
└─scorer───┘ └weights─┘ └embedding┘ └taxonomy┘
```

| Part | What it covers | How it changes |
|---|---|---|
| scorer | The scoring algorithm: `scorer_version` in `weights.yaml` | By hand, when a code change can move a score |
| `w` | Every other setting in `weights.yaml`: component weights, skill weights, embedding dimensions and cosine range, title factor, bands | By itself (hash) |
| `e` | The embedding model and its revision | By itself (hash) |
| `t` | The vocabularies the scorer matches with: `SKILL_ALIASES` and the title words in `titles.py` | By itself (hash) |

Each hash is the first 8 hex digits of a SHA-256 over a canonical JSON form, so the string is the same on any machine, process and Python version. Comments, key order and `70` versus `70.0` in `weights.yaml` don't count. The whole string fits `scores.model_version` (VARCHAR(50)); the scorer version can have up to 17 characters, which `get_model_version()` enforces.

```python
from ats_scoring import MODEL_VERSION, get_model_version, parse_model_version

MODEL_VERSION                      # what score() and score_batch() put in every result
parse_model_version(stored).changed(parse_model_version(MODEL_VERSION))
# e.g. ["embedding"]: which parts differ. None for a version from before L-21 ("hybrid-1.2.0").
```

`score()` and `score_batch()` return it in `model_version` and in `explanation.model_version`. Store it as returned.

## When it changes

| Change | Part | Version changes | Also needed before rescoring |
|---|---|---|---|
| `weights.yaml`: weights, skill weights, bands, cosine range, title factor | `w` | yes, by itself | nothing |
| `weights.yaml`: embedding model or revision | `e` | yes, by itself | re-embed every CV and job (`api/scripts/backfill_embeddings.py`) |
| `SKILL_ALIASES`, title synonyms or title word lists | `t` | yes, by itself | nothing |
| Scoring code that can move a total, a component, the band or the matched skills | scorer | **bump `scorer_version` by hand** | nothing |
| Refactoring or speed-up that moves no result | none | no | |
| CV parser, job parser, the parser's `ALIASES`, ESCO data | none | no | these change *parsed profiles*: see the "profile corrected" trigger |
| Explanation wording only | none | no (bump `EXPLANATION_VERSION`) | |

Bumping the scorer version: minor (`1.2.0` to `1.3.0`) for a behaviour change, major (`2.0.0`) when the components or the shape of the result change. The scorer regression tests ([scorer-regression.md](scorer-regression.md)) are the check: if a code change moves a frozen pair, the PR must bump `scorer_version` and refreeze the pairs with a note.

## When scores are recomputed

A score depends only on its own candidate, job and embeddings, never on the other candidates. Rescore exactly the applications whose inputs changed:

| Trigger | Which applications | When |
|---|---|---|
| **New application**, or a CV parsed for the first time | that application | when the CV's embedding is ready (or without it, see below) |
| **Job requirements edited**: `title`, `description`, `required_skills`, `preferred_skills`, `min_experience_years` | every application of the job | `min_experience_years` alone: at once. Any other field: once the job is re-embedded (B-17 clears the vector on these edits) |
| **Parsed profile corrected**: a recruiter edits `parsed_data`, the CV is re-parsed, or the candidate's name changes (names are removed before scoring) | every application of the candidate | once the CV is re-embedded |
| **Model version changed** (a deploy with a new `MODEL_VERSION`) | every application on an open job; closed jobs only when someone opens their ranking | background batch after the deploy; if `e` changed, after the re-embedding backfill |

Edits that don't change scoring inputs (job status, location, salary, stage moves, notes) don't trigger a rescore.

**Waiting for embeddings.** Scoring without an embedding spreads its weight over the other components. That's valid, but on a slightly different footing from scores that use one ([hybrid-scorer.md](hybrid-scorer.md#for-the-backend-when-scoring-is-wired-in)). If an embedding is still missing after the worker's normal delay (or there is no worker, as on staging), score without it and store `semantic_score` as NULL, not 0 and not the text similarity: NULL says "not computed" (this needs the column to become nullable, see below). When the embedding arrives, rescore with reason `embedding_ready`.

### Publishing a rescore

Rescore jobs run concurrently and can finish out of order: a worker that read the old requirements can finish after one that read the new ones. Debouncing reduces the number of jobs but doesn't stop one that's already running. So a job publishes its result only if what it scored is still current:

1. **Score without a lock.** Read the inputs, compute `inputs_hash` from them, and score. The hash covers everything `score()` reads: the job's scoring fields, `parsed_data`, the names passed as `additional_names`, and, for the CV and the job, whether there's an embedding and its `embedding_model_version`.
2. **Publish in one short transaction.** Lock the application row (`SELECT … FOR UPDATE`, as the stage move already does), then:
   - Re-read the inputs and recompute `inputs_hash`, and read the active model version. If either differs from what was scored, **discard the result**. The edit or deploy that changed it enqueued its own rescore.
   - Read the application's latest score. If it has the same `model_version` and `inputs_hash`, **discard the result** (a repeated trigger).
   - Otherwise **insert** the row, with `calculated_at` taken now, after the lock.

Inserts for one application are serialized by the lock, and only results for the current inputs get in, so the latest row by `calculated_at` is always a score of the current state. Deduplication compares only with the latest row, so a reverted edit (requirements A → B → A) appends a new A row after B instead of being rejected because an old A row exists.

**Active model version.** During a rolling deploy, a worker still running the old code produces scores with the old `MODEL_VERSION`. The backend keeps the active version in one place (for example a single-row `scoring_state` table that the post-deploy backfill sets). A worker whose `MODEL_VERSION` isn't the active one discards its result in step 2 and doesn't retry.

## Old scores are kept

Scores are append-only. A rescore **inserts** a new row and never updates or deletes an earlier one:

- **The current score** of an application is its latest row by `calculated_at`. The stage-move endpoint already reads it that way (`applications.py`, where it copies the score into the history row).
- **A ranking compares only scores with the current `MODEL_VERSION`.** An application whose latest score has an older version is shown with its old score and a "rescoring" state (scope.md, US-12) until the new one is stored. Totals from two versions are never sorted together.
- **Decisions keep what they were based on.** Every stage move already copies the score and `model_version` into `application_stage_history`, so the copy stays readable even if retention later removes old score rows.
- **Why keep them:** an audit can show which score and version a recruiter saw at each point, two versions can be compared on real data, and rolling a deploy back doesn't lose scores.

Retention: old score rows go when the application goes (`ON DELETE CASCADE`). A separate retention rule for superseded scores, if needed, belongs to US-18/19.

## What the backend needs to change

Today `scores` has `UNIQUE (application_id, model_version)`. [parsed-cv-schema.md](parsed-cv-schema.md) describes an upsert on it, and the stage-move endpoint's comment assumes "a re-score replaces the row in scores". That upsert would overwrite the old score when a job is edited and rescored under the same version, which breaks the rule above. Proposed migration:

1. Drop `uq_scores_application_model`. Add an index on `(application_id, calculated_at DESC)` for "latest score".
2. Add `reason VARCHAR(20) NOT NULL`: one of `initial`, `job_edited`, `profile_corrected`, `model_changed`, `embedding_ready`. It says why each row exists.
3. Add `inputs_hash VARCHAR(16) NOT NULL`, the hash from [Publishing a rescore](#publishing-a-rescore). It gets **no** unique constraint: a reverted edit must be able to append the same hash again. Deduplication happens under the lock, against the latest row only.
4. Make `semantic_score` nullable (NULL = scored without an embedding). Keep its 0–100 CHECK, which NULL passes. Then:
   - Update `docs/erd.md`, `docs/schema.sql`, and the `Score` schema in `docs/openapi.yaml` (`semantic_score: number | null`).
   - Update the API's Pydantic schemas, then the web's generated types (`npm run gen:api`) and mocks.
   - The UI shows a NULL component as "not computed", never as 0.
   - The scorer-to-column mapping stops putting the text similarity into `semantic_score`. The text similarity stays in `component_breakdown`.
5. Set `calculated_at` when the row is inserted under the lock, with `clock_timestamp()` or from Python. Postgres's `now()` is the transaction's start time, so a transaction that waited for the lock could get an earlier time than the row it follows.
6. Store the active model version (see above) and check it when publishing.
7. Keep `model_version VARCHAR(50)`; the new format fits.
8. Run rescoring in the Arq worker that already fills embeddings, with the job's applications scored by `score_batch()`.

## To agree

To settle with the backend developer before this page leaves "proposed":

- [ ] The `model_version` format and its 50-character limit
- [ ] The four triggers and the fields that fire them
- [ ] Append-only scores: dropping the unique constraint, adding `reason` and `inputs_hash`
- [ ] Publishing under the application lock: discard stale inputs, an inactive model version, or a repeat of the latest row
- [ ] Where the active model version lives, and who sets it on deploy
- [ ] Model-version backfill: open jobs only, closed jobs on demand
- [ ] Score without an embedding after a delay (`semantic_score` NULL), then rescore when it arrives
- [ ] Nullable `semantic_score` in the database, the API contract and the UI
- [ ] Who owns the B-task for the migration and the rescoring jobs

Agreed by: _(backend developer, date)_
