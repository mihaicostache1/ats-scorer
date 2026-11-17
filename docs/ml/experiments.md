# ML experiments

One section per experiment on the scorer, newest first. Each says what was tried, how, what came out and what was decided. How the evaluation works: [evaluation.md](evaluation.md).

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
