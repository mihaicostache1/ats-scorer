# Scorer regression tests (L-19)

Eleven candidate/job pairs are frozen with their expected results, and CI checks them on every pull request (the "Scorer regression" step of the `ml` job). They catch a score that moves when nobody meant it to, and they make every intended move visible in review, with a note saying why.

| What | Where |
|---|---|
| Test | [ml/tests/test_scorer_regression.py](../../ml/tests/test_scorer_regression.py) |
| Frozen pairs, inputs and vectors | [ml/tests/data/scorer_regression/](../../ml/tests/data/scorer_regression/) |
| Script that freezes them | [ml/evaluation/freeze_regression_pairs.py](../../ml/evaluation/freeze_regression_pairs.py) |

## What is checked

For each pair, the scorer runs on the frozen CV, job and embedding vectors, and the result must keep:

- **the total**, within 2 points of the frozen value. Smaller moves are rounding or refactoring. A bigger move changes behaviour, so a reviewer should see it.
- **the band** (strong, moderate or weak), exactly. It is what a recruiter sees first.
- **the matched skills**, exactly and in the same order.

The pairs come from the rated evaluation set. They cover all six jobs and every rating from 0 to 3. They include the three explanation examples (strong, moderate and weak), the same candidate for two jobs (C021: rated 3 for J01, 0 for J10), and one pair scored without embeddings, so the path where weights are spread over the other components is covered too. Each pair's reason is in `PAIRS` in the script.

The inputs are copies, not links. The evaluation set can change without moving these tests.

## Settings changes fail on purpose

The frozen file records a fingerprint of what should change scores:

- `weights_yaml`: everything in `weights.yaml` (component weights, skill weights, bands, model version), comments excluded
- `embedding_model`: the model and revision
- `skill_taxonomy`: the scorer's `SKILL_ALIASES` and the parser's `ALIASES`

If any of them changes, the test fails even when no frozen score moves, and the failure names what changed. Bands, for example, can move without any total moving.

## Updating the expected values

When a change is intended, in the same PR:

1. If the embedding model changed, rebuild `evaluation/data/embeddings.json` with `embed_eval_set.py` first. The script copies the new vectors from there.
2. From `ml/`, run:

   ```
   python evaluation/freeze_regression_pairs.py --note "Why the values change, e.g. L-20 raised the skill weight to 0.35"
   ```

   The note is required (15 characters or more). It goes into the `history` of `expected.json` with the date, model version and fingerprint. The test fails if the latest fingerprint has no note.
3. Commit `ml/tests/data/scorer_regression/`. The diff of `expected.json` shows which totals, bands and matched skills moved, for the reviewer to judge.

`python evaluation/freeze_regression_pairs.py --check` exits with 1 if the frozen files are not exactly what the scorer gives now. That's stricter than the test, which allows the 2-point margin.

To add a pair, add it to `PAIRS` and run the script with a note. Its CV and job are copied the first time.
