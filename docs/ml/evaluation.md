# Evaluation harness (L-9)

**Owner:** ML/DevOps lead. Code: [ml/ats_scoring/evaluate.py](../../ml/ats_scoring/evaluate.py). Data and results: [ml/evaluation/](../../ml/evaluation/).

A person rates 30 candidate/job pairs from 0 to 3. `python -m ats_scoring.evaluate` scores the same pairs with a scorer and measures how well the scorer's ranking agrees with the person's.

## The evaluation set

30 pairs: 3 jobs, each with 10 candidates, all from the synthetic dataset generated with its default seed (42).

| Job | Title | Minimum experience | Candidates |
|---|---|---|---|
| J01 | Senior Backend Engineer | 6 years | C001, C004, C009, C011, C013, C021, C031, C041, C050, C052 |
| J07 | Data Analyst | 2 years | C001, C003, C006, C008, C009, C017, C027, C047, C067, C077 |
| J10 | Marketing Assistant | 0 years | C004, C008, C009, C010, C020, C021, C040, C047, C050, C060 |

For each job, the 10 candidates are:

- **5 from the job's own role family,** spread over junior, mid, senior and lead.
- **3 from neighbouring families:** DevOps, frontend and data science for J01; data science, product and backend for J07; product, UX design and data analysis for J10.
- **2 from unrelated families.**

The pairs were picked from the generator's metadata (role family and seniority) before anything was scored, so the scorer had no influence on which pairs are in the set. Some CVs appear for more than one job, so there are 22 different CVs. Their PDFs use all four layouts (classic, two-column, table, plain).

| File in `ml/evaluation/` | What it is |
|---|---|
| `pairs.csv` | The 30 pairs, with an empty `rating` column |
| `ratings/<name>.csv` | One file per rater: a filled-in copy of `pairs.csv` |
| `jobs.md` | The three job descriptions, to read while rating |
| `pdfs/` | The 22 CVs, to read while rating |
| `data/` | The same jobs and CVs as JSON: what the scorer receives |
| `results/` | One JSON file per evaluation run |
| `build_eval_set.py` | Rebuilds `data/`, `pdfs/` and `jobs.md` from the synthetic dataset |

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

## How to run it

From `ml/`, with the package installed:

```bash
python -m ats_scoring.evaluate                                    # the L-7 baseline
python -m ats_scoring.evaluate --scorer my_package.my_module:my_score
python -m ats_scoring.evaluate --no-save                          # print only
```

Any function that takes `(candidate, job)` can be evaluated. It must return either the result dict of `ats_scoring.score` or a plain number, and raise `NothingToScoreError` for a pair it cannot score.

Each run prints the metrics and saves them to `results/<date>_<model version>.json`, together with every pair's rating and score. A second run on the same day with the same model version replaces the file.

## Reading the numbers

| Metric | Range | What it says |
|---|---|---|
| Spearman, all pairs | -1 to 1 | Whether higher scores go with higher ratings over all 30 pairs. 1 is the same order, 0 is no relation |
| Spearman, mean per job | -1 to 1 | The same, inside each job, averaged. Closer to how rankings are used, but only 10 pairs per job |
| NDCG@10, mean per job | 0 to 1 | How good each job's ranking is, giving most weight to the top. The ratings are the gains. With 10 candidates per job it covers the whole list |
| NDCG@10 of a random order | 0 to 1 | What a ranking with no skill at all gets. A scorer is only useful if it is clearly above this line |
| Rater agreement | -1 to 1 | Quadratic-weighted Cohen's kappa between raters. 1 is perfect agreement, 0 is what chance gives. Shown only with two or more raters |

## Limits

- **30 pairs and 3 jobs is very little.** A change of a few hundredths means nothing. Use the harness to catch large drops and to compare model versions roughly.
- **The scorer reads the generator's parsed data,** so parsing errors are not part of this test. Real CVs would score worse.
- **Synthetic CVs are cleaner and more uniform than real ones.**
