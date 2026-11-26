# Evaluation harness (L-9)

**Owner:** ML/DevOps lead. Code: [ml/ats_scoring/evaluate.py](../../ml/ats_scoring/evaluate.py). Data and results: [ml/evaluation/](../../ml/evaluation/).

A person rates 60 candidate/job pairs from 0 to 3. `python -m ats_scoring.evaluate` scores the same pairs with a scorer and measures how well the scorer's ranking agrees with the person's.

## The evaluation set

60 pairs: 6 jobs, each with 10 candidates, all from the synthetic dataset generated with its default seed (42). The first 30 pairs (J01, J07, J10) are from L-9. The other 30 (J04, J09, J13) were added for L-15 by [add_pairs.py](../../ml/evaluation/add_pairs.py), with the same rule ([experiments.md](experiments.md#l-15-tuning-the-hybrid-scorers-weights)).

| Job | Title | Minimum experience | Candidates |
|---|---|---|---|
| J01 | Senior Backend Engineer | 6 years | C001, C004, C009, C011, C013, C021, C031, C041, C050, C052 |
| J04 | Lead Platform Engineer | 9 years | C004, C014, C024, C029, C034, C035, C050, C081, C084, C092 |
| J07 | Data Analyst | 2 years | C001, C003, C006, C008, C009, C017, C027, C047, C067, C077 |
| J09 | UX Designer | 3 years | C015, C029, C039, C040, C049, C052, C059, C078, C079, C094 |
| J10 | Marketing Assistant | 0 years | C004, C008, C009, C010, C020, C021, C040, C047, C050, C060 |
| J13 | Senior Data Scientist | 5 years | C021, C023, C036, C048, C053, C063, C077, C083, C093, C100 |

For each job, the 10 candidates are:

- **5 from the job's own role family,** spread over junior, mid, senior and lead.
- **3 from neighbouring families:** DevOps, frontend and data science for J01; data science, product and backend for J07; product, UX design and data analysis for J10; backend, QA and frontend for J04; frontend, product and marketing for J09; data analysis, backend and product for J13. In the L-15 jobs the 5 from the job's own family are one junior, one mid, one senior, one lead and one more.
- **2 from unrelated families.**

The pairs were picked from the generator's metadata (role family and seniority) before anything was scored, so the scorer had no influence on which pairs are in the set. Some CVs appear for more than one job, so there are 45 different CVs. Their PDFs use all four layouts (classic, two-column, table, plain).

| File in `ml/evaluation/` | What it is |
|---|---|
| `pairs.csv` | The 60 pairs, grouped by job, with an empty `rating` column |
| `ratings/<name>.csv` | One file per rater: a filled-in copy of `pairs.csv` |
| `jobs.md` | The six job descriptions, to read while rating |
| `pdfs/` | The 45 CVs, to read while rating |
| `data/` | The same jobs and CVs as JSON: what the scorer receives |
| `results/` | One JSON file per evaluation run |
| `build_eval_set.py` | Rebuilds `data/`, `pdfs/` and `jobs.md` from the synthetic dataset |
| `add_pairs.py` | Added the L-15 pairs to `pairs.csv` (run once) |
| `merge_ratings.py` | Merges new ratings into an existing `ratings/<name>.csv` |
| `retest/<name>_<date>.csv` | A later rating of pairs already rated, by the same rater. Never used by the evaluation |
| `retest.py` | Compares a file in `retest/` with `ratings/<name>.csv`: how consistent one rater is |
| `tune_weights.py` | The L-15 grid search over the scorer weights |

## The ratings file

A CSV with exactly the columns of `pairs.csv`: `candidate_id`, `job_id` and `rating`. A rating is a whole number from 0 to 3. Rows left empty are ignored. With several raters, each pair's rating is the mean over the raters.

## How to rate

1. Copy `pairs.csv` to `ratings/<your-name>.csv`.
2. Take one job at a time. Read its description in `jobs.md`, then read each of its 10 CVs in `pdfs/` and fill in the rating. Rate all 10 in one sitting, so you use the scale the same way for all of them.
3. Use this scale (the same as in [ml/synthetic/README.md](../../ml/synthetic/README.md)):

| Rating | Meaning | Rule of thumb |
|---|---|---|
| 3 | Strong fit | Has nearly all required skills and at least the required experience. You would shortlist |
| 2 | Good fit | Has most required skills. One gap in skills or experience that an interview could clear up |
| 1 | Weak fit | Related background, but several required skills are missing or the seniority is clearly wrong |
| 0 | No fit | A different field, or almost none of the requirements |

Rules:

- **Rate before you look at any scores.** Do not run `score()` or the evaluation until your file is complete.
- **Read the PDFs, not the JSON files in `data/`.** Rate what a recruiter would see.
- **Judge qualifications only.** Ignore the name, location, date of birth, nationality and how nice the layout looks.
- **A second rater helps.** The person who built the scorer may lean, without meaning to, towards what the scorer rewards. A colleague rating the same file independently reduces that, and the evaluation then reports how much the two of you agree.

### Rating with the labeling tool (optional)

Instead of editing the CSV by hand you can use the web app's labeling tool (F-13). Start the web app in
development mode (`npm run dev` in `web/`) and open <http://localhost:3000/dev/labeling>. It exists only in the
dev server: a production build does not contain it.

It follows the rules above. The CV is the PDF, next to the job description, and no score is ever shown. Type your
name (it becomes the file name), rate each pair with the keys `0` to `3`, skip with `S`, undo with `U`. Progress is
kept in the browser, so you can close the tab and carry on. **Export CSV** downloads `<your-name>.csv`: a filled-in
copy of `pairs.csv` with the same rows in the same order and empty ratings where you skipped. Save it as
`ratings/<your-name>.csv`, unedited, and run the evaluation. Key list and details: [web/README.md](../../web/README.md#dev-only-routes-and-the-labeling-tool).

**Rating only pairs added later.** When pairs are added to a set you have already rated, the tool starts over (it
offers to download the old progress first), because saved progress belongs to one version of the set. Move past the
pairs you have already rated with `→`, rate the new ones, export, and merge the export into your file instead of
replacing it: `python evaluation/merge_ratings.py ~/Downloads/<your-name>.csv` from `ml/`. It refuses a pair rated
differently in the two files. If you rated the old pairs again as well, add `--only-new`: it keeps the ratings you already had and takes only
the pairs that were not rated yet. Keep the export as `retest/<your-name>_<date>.csv` and compare the two ratings with
`python evaluation/retest.py retest/<your-name>_<date>.csv`.

## How to run it

From `ml/`, with the package installed:

```bash
python -m ats_scoring.evaluate                                    # the current scorer (hybrid, L-13)
python -m ats_scoring.evaluate --no-embeddings                    # the same without embeddings
python -m ats_scoring.evaluate --scorer my_package.my_module:my_score
python -m ats_scoring.evaluate --no-save                          # print only
```

Any function that takes `(candidate, job)` can be evaluated. It must return either the result dict of `ats_scoring.score` or a plain number, and raise `NothingToScoreError` for a pair it cannot score.

**Embeddings.** The embeddings of the 45 CVs and 6 jobs are precomputed in `data/embeddings.json`, so evaluating needs neither the model nor PyTorch. When that file exists, the scorer also gets the keyword arguments `candidate_embedding` and `job_embedding`. A scorer that does not take them must be run with `--no-embeddings`. Rebuild the file with `python evaluation/embed_eval_set.py --model-dir <model folder>` whenever `data/` or the embedding model in `weights.yaml` changes. The harness refuses a file made with another model or revision.

Each run prints the metrics and saves them to `results/<date>_<model version>.json` (`..._no-embeddings.json` with `--no-embeddings`), together with every pair's rating and score. A second run on the same day with the same model version replaces the file.

## Results so far

| Model | Spearman, all pairs | Spearman, mean per job | NDCG@10 | Write-up |
|---|---|---|---|---|
| `tfidf-skills-0.1.0` (L-7 baseline) | 0.701 | 0.740 | 0.982 | [ml/README.md](../../ml/README.md) |
| `hybrid-1.0.0` (L-13) | 0.739 | 0.809 | 0.985 | [hybrid-scorer.md](hybrid-scorer.md) |
| `hybrid-1.1.0` (L-14, 1.0.0 plus redaction) | 0.739 | 0.809 | 0.985 | [redaction.md](redaction.md). Same scores: the set has no identity details in the fields the scorer reads |
| `hybrid-1.2.0` (L-17, 1.1.0 plus explanation and band) | 0.739 | 0.809 | 0.985 | [score-explanation.md](score-explanation.md). Same scores as 1.1.0 on every pair: only the explanation is new |

A random order gets an NDCG@10 of 0.784.

## Reading the numbers

| Metric | Range | What it says |
|---|---|---|
| Spearman, all pairs | -1 to 1 | Whether higher scores go with higher ratings over all 60 pairs. 1 is the same order, 0 is no relation |
| Spearman, mean per job | -1 to 1 | The same, inside each job, averaged. Closer to how rankings are used, but only 10 pairs per job |
| NDCG@10, mean per job | 0 to 1 | How good each job's ranking is, giving most weight to the top. The ratings are the gains. With 10 candidates per job it covers the whole list |
| NDCG@10 of a random order | 0 to 1 | What a ranking with no skill at all gets. A scorer is only useful if it is clearly above this line |
| Rater agreement | -1 to 1 | Quadratic-weighted Cohen's kappa between raters. 1 is perfect agreement, 0 is what chance gives. Shown only with two or more raters |

## Limits

- **60 pairs and 6 jobs is very little.** A change of a few hundredths means nothing. Use the harness to catch large drops and to compare model versions roughly.
- **The scorer reads the generator's parsed data,** so parsing errors are not part of this test. Real CVs would score worse.
- **Synthetic CVs are cleaner and more uniform than real ones.**
