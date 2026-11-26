# ML experiments

One section per experiment on the scorer, newest first. Each says what was tried, how, what came out and what was decided. How the evaluation works: [evaluation.md](evaluation.md).

## L-18: band thresholds

**Status:** done, 2026-11-21. **Decision: strong from 70, moderate from 50, weak below**, in `weights.yaml` (`hybrid-1.2.0`). Owner: ML/DevOps lead.

| What | Where |
|---|---|
| Search and check | [ml/evaluation/band_thresholds.py](../../ml/evaluation/band_thresholds.py) |
| Result | [ml/evaluation/results/2026-11-21_band-thresholds.json](../../ml/evaluation/results/2026-11-21_band-thresholds.json) |
| Thresholds | `bands` in [ml/ats_scoring/weights.yaml](../../ml/ats_scoring/weights.yaml) |
| Band names and UI wording | [score-explanation.md](score-explanation.md#bands-in-the-ui) |

### Question

The ranked list shows a band next to each score: strong, moderate or weak (US-08). Where should the cuts be, and how often does a band agree with what a person would say about the candidate?

**What the score is.** The score ranks candidates for one job. It is not a probability that the candidate passes screening, and the band is not a verdict: it is a coarse label on that ranking, to help a recruiter decide whom to read first. Everything below measures how well the bands line up with one person's ratings, not how likely anyone is to be hired.

### Setup

**Fit on the L-9 pairs, check on the L-15 pairs.** The thresholds are picked on the 30 carefully rated L-9 pairs (J01, J07, J10) and checked on the 30 pairs added in L-15 (J04, J09, J13), which were rated in a hurried session. The split is by job, so the check also asks whether thresholds carry over to jobs they were not picked on.

**Target band per rating,** from the rating scale ([evaluation.md](evaluation.md#the-ratings-file)): 3 "strong fit, you would shortlist" should be strong, 2 "good fit, one gap" moderate, 1 "weak fit" and 0 "no fit" weak.

**Thresholds tried:** multiples of 5 from 5 to 95, moderate below strong (171 pairs). 30 pairs cannot support a finer cut, and round numbers are easier to explain.

**Objective:** the highest quadratic-weighted kappa between band and target band on the fit pairs, so a "no fit" in strong costs more than in moderate. Ties go to fewer two-band errors (a 3 in weak, or a 0 or 1 in strong), then to the middle of the tied thresholds.

**Decision rule, fixed before the run:** the picked thresholds go into `weights.yaml` if the weighted kappa on the check pairs is at least 0.40. Otherwise bands stay out of the UI until there is better data.

**Not a clean check, in one respect.** L-17 had already set provisional thresholds (60 / 40) by reading a table of all 60 pairs, so the check pairs had been looked at once before this rule was written. The rule does not use 60 / 40, and the fit half alone picks the thresholds, but the author knew the shape of the data.

**Scorer:** `hybrid-1.2.0` with the stored embeddings. Its totals are the same as `hybrid-1.1.0` on every pair.

### Results

One run of `python evaluation/band_thresholds.py` on 2026-11-21, 60 rated pairs, one rater.

**Picked: strong from 70, moderate from 50.** It was the only best pair on the fit half (weighted kappa 0.755, one two-band error). Next best: 70 / 55 (0.734), 60 / 50 (0.730), 65 / 50 (0.726). **The rule holds:** weighted kappa on the check half is 0.571 (95% bootstrap interval 0.384 to 0.722, resampling candidates within each job).

| Half | Pairs | Weighted kappa | Same band as the rating | Two-band errors |
|---|---|---|---|---|
| Fit (J01, J07, J10) | 30 | 0.755 | 77% | 1 |
| Check (J04, J09, J13) | 30 | 0.571 | 60% | 1 |
| All | 60 | 0.673 | 68% | 2 |

Each band against the ratings, all 60 pairs. Precision: of the pairs in the band, the share whose rating belongs there. Recall: of the pairs whose rating belongs in the band, the share that got it.

| Band | Pairs | Rated 3 | 2 | 1 | 0 | Precision | Recall |
|---|---|---|---|---|---|---|---|
| strong (70+) | 5 | 5 | 0 | 0 | 0 | 1.00 | 0.28 |
| moderate (50-69.99) | 19 | 11 | 5 | 3 | 0 | 0.26 | 0.63 |
| weak (below 50) | 36 | 2 | 3 | 10 | 21 | 0.86 | 0.91 |

By half:

| Band | Fit: pairs | rated 3 / 2 / 1 / 0 | Check: pairs | rated 3 / 2 / 1 / 0 |
|---|---|---|---|---|
| strong | 5 | 5 / 0 / 0 / 0 | 0 | 0 / 0 / 0 / 0 |
| moderate | 9 | 3 / 4 / 2 / 0 | 10 | 8 / 1 / 1 / 0 |
| weak | 16 | 1 / 1 / 6 / 8 | 20 | 1 / 2 / 4 / 13 |

Per job, with the median total of the pairs rated 3:

| Job | Weighted kappa | Same band | Strong / moderate / weak | Highest total | Median total of the 3s |
|---|---|---|---|---|---|
| J01 Senior Backend Engineer | 0.923 | 90% | 2 / 2 / 6 | 83.8 | 79.0 |
| J07 Data Analyst | 0.568 | 60% | 2 / 3 / 5 | 71.2 | 64.4 |
| J10 Marketing Assistant | 0.815 | 80% | 1 / 4 / 5 | 73.4 | 70.7 |
| J04 Lead Platform Engineer | 0.333 | 70% | 0 / 1 / 9 | 62.6 | 55.3 |
| J09 UX Designer | 0.638 | 50% | 0 / 4 / 6 | 69.4 | 66.7 |
| J13 Senior Data Scientist | 0.636 | 60% | 0 / 5 / 5 | 66.8 | 66.5 |

- **Strong is precise and rare.** All 5 pairs in strong were rated 3, and no 0 or 1 ever reached it. But only 5 of the 18 pairs rated 3 are strong; 11 are moderate. On the check jobs nobody is strong, including the 9 pairs rated 3.
- **Weak is reliable.** 31 of the 36 weak pairs were rated 0 or 1. Two pairs rated 3 fell in weak, one per half: C008/J07 (24.0, a candidate the scorer misses) and C084/J04 (48.1, just under the cut).
- **Moderate is mixed.** It holds most of the good candidates the strong cut leaves out, plus three pairs rated 1. In the UI it reads as "worth a look", not "average".
- **The same score means different things in different jobs.** The median total of the pairs rated 3 runs from 55 (J04) to 79 (J01). A fixed cut cannot fit every job: the top candidate for J04 scores 62.6, which is moderate even though they were rated 3. This is why the score is a ranking aid within a job, and why the list should be read top-down rather than by band alone.
- **Missing embeddings barely move bands.** Scored without embeddings, 2 of the 60 pairs change band (C020/J10 from moderate to weak, C027/J07 from strong to moderate). Weighted kappa over all 60 goes from 0.673 to 0.642.
- **For comparison, L-17's 60 / 40** gives weighted kappa 0.682 on the fit half and 0.935 on the check half, with 16 of the 18 pairs rated 3 in strong. It was chosen after looking at all 60 pairs, so its check figure is not a fair test, and the rule fixed before this run does not consider it. It is the natural candidate to test against 70 / 50 when new pairs are rated.

### Decision

**Use strong from 70, moderate from 50** (`weights.yaml`). The rule holds: check kappa 0.571 against a minimum of 0.40. The UI wording is chosen to match what the bands do: strong is rare and means "very likely a good fit", moderate holds most good candidates, and weak means "unlikely fit", never "rejected" ([score-explanation.md](score-explanation.md#bands-in-the-ui)).

`hybrid-1.2.0` has not been released (L-17 is not merged yet), so the thresholds change within that version. Any later change needs a new `model_version`.

What would help next:

1. New rated pairs, ideally by a second rater, to test 70 / 50 against 60 / 40 on data neither was chosen on. The 60 pairs here have now been used for the bands as well as the weights.
2. Per-job bands. The per-job table shows that the score's level depends on the job. A band relative to the job's own candidates (for example, the top tenth) would follow the ranking instead of a fixed number, but it needs enough candidates per job and a product decision.

### Limits

- **One rater, 60 synthetic pairs, 6 jobs.** The same limits as L-15. With 30 pairs per half, a band moving by one pair changes exact agreement by 3 points, and the bootstrap interval of the check kappa is wide (0.38 to 0.72).
- **The check half was rated with less care.** Noisy labels pull its agreement down, so 0.571 may understate how well the bands work. They do not explain why strong is empty on the check jobs: their totals are lower.
- **The check half was not unseen.** See Setup. The fit half alone picked the thresholds, under a rule written before the run.
- **The target mapping is a choice.** Putting rating 2 in strong instead of moderate would favour a lower strong cut. The mapping follows the rating scale's wording, where only a 3 is "you would shortlist".

## L-15: tuning the hybrid scorer's weights

**Status:** done, 2026-11-17. **Decision: keep the current weights.** Owner: ML/DevOps lead.

| What | Where |
|---|---|
| Grid search | [ml/evaluation/tune_weights.py](../../ml/evaluation/tune_weights.py) |
| The 30 new pairs | [ml/evaluation/add_pairs.py](../../ml/evaluation/add_pairs.py), appended to [pairs.csv](../../ml/evaluation/pairs.csv) |
| Ratings | [ml/evaluation/ratings/mihai.csv](../../ml/evaluation/ratings/mihai.csv) |
| Re-rating of the L-9 pairs | [ml/evaluation/retest/mihai_2026-11-17.csv](../../ml/evaluation/retest/mihai_2026-11-17.csv), compared by [retest.py](../../ml/evaluation/retest.py) |
| Result | [ml/evaluation/results/2026-11-17_weight-tuning.json](../../ml/evaluation/results/2026-11-17_weight-tuning.json) |

### Question

L-13 set the hybrid scorer's weights by reasoning and a few hand-tried variants on the 30 L-9 pairs, and deliberately did not search them, because with 30 pairs a search fits the rater and those 3 jobs ([hybrid-scorer.md](hybrid-scorer.md#weights)). With twice the pairs, can a search find weights that rank candidates better **on jobs it was not tuned on**?

### Setup

**30 more pairs, 60 in all.** Three more jobs from the synthetic dataset, picked to fill gaps in the first three: a lead technical job, a mid design job and a senior data job. Their candidates were picked from the generator's metadata only, by the same rule as the first 30 pairs, before anything was scored.

| Job | Title | Minimum experience | Candidates |
|---|---|---|---|
| J04 | Lead Platform Engineer (DevOps) | 9 years | C004, C014, C024, C029, C034, C035, C050, C081, C084, C092 |
| J09 | UX Designer | 3 years | C015, C029, C039, C040, C049, C052, C059, C078, C079, C094 |
| J13 | Senior Data Scientist | 5 years | C021, C023, C036, C048, C053, C063, C077, C083, C093, C100 |

For each job: 5 from its own role family (one junior, mid, senior and lead, plus one more), 3 from neighbouring families and 2 from unrelated ones (the families are listed in `add_pairs.py`). The set now has 6 jobs and 45 different CVs. The new pairs were rated with the F-13 labeling tool, by the same rater, with the same scale and rules, without looking at any score. **They were rated with less care than the L-9 pairs:** the rater said afterwards that they were not paying close attention during that session (2026-11-17), so the J04, J09 and J13 ratings are noisier than the others.

**The L-9 pairs were rated again, by accident, and the first ratings were kept.** On 2026-11-17 the rater rated all 60 pairs in the labeling tool, the 30 L-9 pairs included, without looking at the first ratings or at any score. Only the 30 new ratings were merged into `ratings/mihai.csv` (`merge_ratings.py --only-new`), as this plan describes. The L-9 ratings stay as they were, so the L-7 baseline and L-13 numbers stay comparable. This was decided before the tuning run. The second rating is kept in `retest/` and is not used for tuning. It shows how consistent one rater is (`python evaluation/retest.py retest/mihai_2026-11-17.csv`):

| Same rating | Within one point | Weighted kappa | Spearman, all 30 | J01 | J07 | J10 |
|---|---|---|---|---|---|---|
| 21 of 30 | 27 of 30 | 0.802 | 0.807 | 0.864 | 0.751 | 0.903 |

9 pairs changed, 3 of them by two points (C003/J07 0 → 2, C009/J07 2 → 0, C050/J10 1 → 3), and the mean rating stayed at 1.50. Because this second rating was done with less care, these numbers understate how consistent the rater is when careful. They are a pessimistic estimate, not a ceiling.

**Split by job, fixed before rating.** Every metric is computed within a job, and the question is whether weights carry over to other jobs, so the halves are jobs, not pairs. Each half has a technical job, a data job and a non-engineering job:

| Half | Jobs |
|---|---|
| Tuning | J01 Senior Backend Engineer, J07 Data Analyst, J09 UX Designer |
| Held out | J04 Lead Platform Engineer, J10 Marketing Assistant, J13 Senior Data Scientist |

**Grid.** Every weighting of the five components in steps of 0.05 that adds up to 1, with each component at least 0.05: 3,876 weightings. A component at 0 would also lose its line in the explanations recruiters read, so it is not allowed. Only the five weights are searched. The skill weights (1.0 and 0.5), the cosine range and the title factor stay as they are.

**Objective.** The highest mean Spearman per job on the tuning jobs. Ties go to the higher NDCG@10, then the higher Spearman over all pairs, then the weighting closest to the current one.

**Decision rule, fixed before rating.** The tuned weights replace `weights.yaml` only if, on the held-out jobs, they beat the current weights on mean Spearman per job by at least 0.01 **and** are no worse on NDCG@10 and on Spearman over all pairs. A 95% bootstrap interval (5,000 resamples of candidates within each held-out job) is reported alongside, to show how much of the gain could be noise. It is not part of the rule: with 30 held-out pairs almost no gain would pass it.

**Baseline.** The L-7 scorer (`tfidf-skills-0.1.0`): 0.6 skill overlap plus 0.4 TF-IDF. It no longer exists as code, but the hybrid scorer with these two weights and the others at 0 gives the same totals. On the 30 L-9 pairs it reproduces L-7's published numbers exactly (0.701, 0.740, 0.982).

**Scorer version.** `hybrid-1.0.0` from `main`, without the L-14 redaction. If L-14 is merged first, the run is repeated on top of it before this is merged. _As run:_ L-14 was merged before the ratings were in, so the only run was on `hybrid-1.1.0` (with redaction), with `data/embeddings.json` rebuilt after L-14.

### Results

One run of `python evaluation/tune_weights.py` on 2026-11-17: `hybrid-1.1.0`, 60 rated pairs, one rater. Weights are skill overlap / embedding / experience / title / TF-IDF.

| Scorer | Weights | Half | Spearman all | Spearman per job | NDCG@10 |
|---|---|---|---|---|---|
| Baseline (L-7) | 0.60 / 0 / 0 / 0 / 0.40 | tuning | 0.725 | 0.750 | 0.987 |
| | | held out | 0.851 | 0.884 | 0.967 |
| Hybrid (`weights.yaml`) | 0.30 / 0.35 / 0.10 / 0.15 / 0.10 | tuning | 0.757 | 0.818 | 0.990 |
| | | held out | **0.876** | **0.918** | **0.987** |
| Tuned | 0.10 / 0.10 / 0.15 / 0.30 / 0.35 | tuning | 0.822 | 0.833 | 0.991 |
| | | held out | 0.850 | 0.852 | 0.938 |

Spearman per job:

| Scorer | J01 | J07 | J09 | J04 | J10 | J13 |
|---|---|---|---|---|---|---|
| Baseline (L-7) | 0.699 | 0.612 | 0.937 | 0.853 | 0.909 | 0.890 |
| Hybrid (`weights.yaml`) | 0.833 | 0.684 | 0.937 | 0.911 | 0.909 | 0.934 |
| Tuned | 0.877 | 0.684 | 0.937 | 0.820 | 0.783 | 0.953 |

J01, J07 and J09 are the tuning jobs; J04, J10 and J13 are held out.

- **The search found a reversed weighting.** The best weighting on the tuning jobs moves weight from skills and embeddings to title and TF-IDF. All 10 best weightings have skills at 0.10 or less and title at 0.20 or more. They tie on per-job Spearman (0.833) and NDCG@10 (0.991): 2 of 3,876 tie on all three criteria, so the region is flat, as expected.
- **Its gain on the tuning jobs is small and comes from one job.** Per-job Spearman goes from 0.818 to 0.833 (+0.015), all of it from J01. J07 and J09 do not change.
- **It does not carry over.** On the held-out jobs, per-job Spearman drops from 0.918 to 0.852 (−0.066), NDCG@10 from 0.987 to 0.938, and all-pairs Spearman from 0.876 to 0.850. It is worse on J04 and J10 (J10 falls from 0.909 to 0.783) and slightly better on J13. Bootstrap of the held-out difference, tuned minus hybrid: per-job Spearman −0.067 (95% −0.240 to +0.023), NDCG@10 −0.035 (95% −0.084 to +0.006).
- **The current weights hold up on new jobs.** L-13 set them on J01, J07 and J10. On the three jobs it never saw (J04, J09, J13), the hybrid scorer averages 0.927 per-job Spearman against the L-7 baseline's 0.893, and it is never worse than the baseline on any of the six jobs.
- **The decision does not rest on the less careful labels.** On the carefully rated L-9 jobs alone, the pattern is the same: the tuned weights gain on J01 (tuning) and lose most on J10 (held out, 0.909 to 0.783). The noisier J04, J09 and J13 labels add to that picture but do not drive it. Noisy labels make a real gain harder to see. They do not explain a loss of this size.
- **Label noise is large compared with the differences being tuned.** On J01, J07 and J10, the hybrid scorer agrees with the ratings (mean per-job Spearman 0.809) about as well as the rater's hurried re-rating agreed with their careful first rating (0.839). That comparison is rough, since the re-rating was done with less care, but differences between weightings of a few hundredths are within label noise.

### Decision

**Keep `weights.yaml` as it is** (`hybrid-1.1.0`, 0.30 / 0.35 / 0.10 / 0.15 / 0.10). Under the rule fixed before rating, the tuned weights needed a held-out gain of at least +0.01 in per-job Spearman and no loss on the other two metrics. They lost 0.066 and lost on both other metrics. No new model version.

What this says: with this data, searching the weights fits the tuning jobs and does not generalize, which is the risk L-13 gave for not searching. The held-out half has now been used, so these 60 pairs should not be used to search the weights again. What would help next, in order:

1. A second rater on the 60 pairs, to measure agreement between people and average out single-label noise. A careful re-rating of J04, J09 and J13 by the same rater, some time later, would also help, for the next experiment. These 60 pairs must not be used to re-run this one.
2. Rated pairs from real (anonymized) CVs, where empty components and parsing errors matter.
3. Only then another search, on a larger set with a fresh held-out part.

### Limits

- **Synthetic data.** All CVs and jobs come from the generator: cleaner, more uniform and shorter than real ones, with skills spelled consistently. Weights that suit them may not suit real CVs, where parsing errors, missing `experience_years` and unusual titles leave components empty more often.
- **A small set.** 60 pairs and 6 jobs, so each half has 30 pairs and 3 jobs. With 10 candidates, swapping two neighbours moves a job's Spearman by about 0.01, and moving one candidate three places by about 0.07. Differences of a few hundredths are within noise, as the bootstrap interval shows.
- **One rater, who also built the scorer.** The ratings reflect one person's judgement, and that person may lean towards what the scorer rewards. Agreement with a second person cannot be measured. Agreement with themselves was measured once (above, 0.80 weighted kappa), but from a session done with less care, so it is a pessimistic figure. The 30 new pairs come from that same session. A second rater would help more than more tuning.
- **The scorer reads the generator's parsed data,** so parsing errors are not part of the test.
- **NDCG@10 is near its ceiling** (about 0.98 for every scorer), so it can barely tell weightings apart. It acts as a guard, not as a target.
- **The best weighting is not sharp.** On 30 pairs, many weightings give the same or nearly the same rankings (the run prints the top 10 and how many tie). The tie-break towards the current weights picks one, so the tuned weights are a point in a flat region, not a precise optimum.
- **The held-out half was looked at once.** If the run is repeated with other settings after seeing the held-out result, the held-out half is no longer held out.
