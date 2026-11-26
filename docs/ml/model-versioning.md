# Model versioning and rescoring policy (L-21)

**Status:** Model versioning is implemented in `ats_scoring.versioning`. B-18 provides the job scoring task and application score history. The automatic rescoring policy is proposed (see [To agree](#to-agree)). Owner: ML/DevOps lead.

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

**Waiting for embeddings.** Scoring without an embedding spreads its weight over the other components. A score produced this way carries a null `embedding_similarity` component in its explanation ([hybrid-scorer.md](hybrid-scorer.md#for-the-backend-when-scoring-is-wired-in)). The proposed scheduling policy allows this fallback after a delay and schedules another score when the embedding arrives.

### Publishing a rescore

Rescore jobs run concurrently and can finish out of order: a worker that read the old requirements can finish after one that read the new ones. Debouncing reduces the number of jobs but doesn't stop one that's already running. So a job publishes its result only if what it scored is still current:

1. **Score without a lock.** Read the inputs, compute `inputs_hash` from them, and score. The hash covers everything `score()` reads: the job's scoring fields, `parsed_data`, the names passed as `additional_names`, and, for the CV and the job, whether there's an embedding and its `embedding_model_version`.
2. **Publish in one short transaction.** Lock the application row (`SELECT … FOR UPDATE`, as the stage move already does), then:
   - Re-read the inputs and recompute `inputs_hash`, and read the active model version. If either differs from what was scored, **discard the result**. The edit or deploy that changed it enqueued its own rescore.
   - Read the application's latest score. If it has the same `model_version` and `inputs_hash`, **discard the result** (a repeated trigger).
   - Otherwise **insert** the row, with `computed_at` taken now, after the lock.

Inserts for one application are serialized by the lock. The worker checks the scoring inputs before publishing a result. Deduplication compares with the current row, so a reverted edit (requirements A → B → A) appends a new A row after B.

**Active model version.** During a rolling deploy, a worker still running the old code produces scores with the old `MODEL_VERSION`. The backend keeps the active version in one place (for example a single-row `scoring_state` table that the post-deploy backfill sets). A worker whose `MODEL_VERSION` isn't the active one discards its result in step 2 and doesn't retry.

## Old scores are kept

Each rescore inserts a new outcome and clears the preceding row's `is_current` flag. Historical score values and explanations are preserved.

- **The current score** of an application is the `application_scores` row with `is_current` set. The stage-move endpoint copies its score and model version into the history row. Older applications can still have a score in the legacy `scores` table.
- **A ranking compares only scores with the current `MODEL_VERSION`.** An application whose latest score has an older version is shown with its old score and a "rescoring" state (scope.md, US-12) until the new one is stored. Totals from two versions are never sorted together.
- **Decisions keep what they were based on.** Every stage move already copies the score and `model_version` into `application_stage_history`, so the copy stays readable even if retention later removes old score rows.
- **Why keep them:** an audit can show which score and version a recruiter saw at each point, two versions can be compared on real data, and rolling a deploy back doesn't lose scores.

Retention: old score rows go when the application goes (`ON DELETE CASCADE`). A separate retention rule for superseded scores, if needed, belongs to US-18/19.

## Backend implementation

The B-18 job worker stores history in `application_scores`. Queue it from the backend with
`await queue.enqueue_job("score_job", str(org_id), str(job_id), MODEL_VERSION)`. Each application
has at most one current outcome. A `needs_review` outcome carries no numeric score, band or
explanation. Scored outcomes store the validated L-17 explanation, including a null embedding
component when a usable vector is unavailable.

`inputs_hash` is compared with the current outcome under the publication lock. The database sets
`computed_at` with `clock_timestamp()` at insertion. The worker accepts the scorer version in the
queue payload and checks it against its installed scorer. Automatic triggers, rollout coordination
and exposing the current result through the ranking API are follow-up integration work.

## To agree

To settle with the backend developer before this page leaves "proposed":

- [ ] The `model_version` format and its 50-character limit
- [ ] The four triggers and the fields that fire them
- [ ] Recording a reason with automatically triggered scores
- [ ] Where the active model version lives, and who sets it on deploy
- [ ] Model-version backfill: open jobs only, closed jobs on demand
- [ ] The delay before automatic fallback scoring and the rescore when an embedding arrives
- [ ] The ranking API contract and UI display for missing components and `needs_review`
- [ ] Ownership of rollout and automatic rescoring

Agreed by: _(backend developer, date)_
