# Hybrid scorer v1 (L-13)

**Status:** implemented, `model_version` `hybrid-1.0.0`. Not called by the API yet. Owner: ML/DevOps lead.

| What | Where |
|---|---|
| Scorer | [ml/ats_scoring/scoring.py](../../ml/ats_scoring/scoring.py) |
| Weights and model version | [ml/ats_scoring/weights.yaml](../../ml/ats_scoring/weights.yaml), loaded by [config.py](../../ml/ats_scoring/config.py) |
| Embeddings (offline) | [ml/ats_scoring/embeddings.py](../../ml/ats_scoring/embeddings.py) |
| Title similarity | [ml/ats_scoring/titles.py](../../ml/ats_scoring/titles.py) |
| Evaluation result | [ml/evaluation/results/2026-11-07_hybrid-1.0.0.json](../../ml/evaluation/results/2026-11-07_hybrid-1.0.0.json) |
| Ablation | [ml/evaluation/ablation.py](../../ml/evaluation/ablation.py) |
| Timing | [ml/benchmarks/time_scoring.py](../../ml/benchmarks/time_scoring.py) |

## Result in one paragraph

The hybrid scorer beats the L-7 baseline on all three L-9 metrics: Spearman over all pairs 0.739 against 0.701, mean Spearman per job 0.809 against 0.740, and NDCG@10 0.985 against 0.982. Only the per-job Spearman gain is clearly more than noise on 30 pairs. Ranking 1,000 candidates takes about **0.5 s** on a laptop CPU, with no network access. Embedding 1,000 CVs takes about **16 s**, but that is done once per CV when it is parsed, not each time candidates are ranked.

## Components

`score(candidate, job, *, candidate_embedding=None, job_embedding=None)` returns five components, each from 0 to 100, or `None` when it cannot be computed:

| Component | Weight | How it is computed | `None` when |
|---|---|---|---|
| `skill_overlap` | 0.30 | Weighted share of the job's skills found in the CV's skill list. A required skill weighs 1.0 and a nice-to-have one 0.5. A skill listed as both counts as required | The job lists no skills |
| `embedding_similarity` | 0.35 | Cosine of the CV and job embeddings (`multilingual-e5-small`), mapped linearly from [0.80, 0.95] to 0-100 | Either embedding is missing |
| `experience_fit` | 0.10 | 100 when the CV's `experience_years` meets the job's `min_experience_years`, falling linearly to 0 at no experience. More years than asked are not penalized | Either number is missing, or the job asks for 0 years |
| `title_similarity` | 0.15 | Word overlap between the job title and the CV's headline and position titles, with seniority words removed. Older positions count 0.8 | The job or the CV has no title |
| `text_similarity` | 0.10 | TF-IDF cosine of the CV and job texts, as in the baseline | Never |

The total is the weighted mean of the components that are present. When a component is `None`, its weight is shared among the others in proportion to their weights, and `weights` in the result shows the weights actually used. A missing component never counts as 0. A CV with no years of experience is not scored as having none, for example.

### Design notes

- **Embeddings are computed before scoring, not inside it.** `score()` only compares two lists of numbers. It loads no model, needs no PyTorch, and cannot make a network call. A test blocks sockets and checks this.
- **The cosine is rescaled.** e5 gives even unrelated texts a cosine around 0.8 (L-6). On 1,000 synthetic CVs against 20 jobs, the 1st percentile is 0.80 and the 99th is 0.92, so [0.80, 0.95] spreads real pairs over the whole 0-100 range.
- **Experience: only a minimum, no upper limit.** Years of experience track age, so penalizing too much experience would penalize older candidates. The checklist rules this out ([privacy-ethics-checklist.md](../privacy-ethics-checklist.md)).
- **A minimum of 0 years is not scored.** Every candidate meets it, so it would add the same points to everyone and push unrelated candidates up to about 15/100.
- **Title: seniority words are removed.** "Senior Backend Engineer" and "Backend Developer" count as the same role. Seniority is the experience component's job. Developer and engineer are treated as synonyms. Generic words (engineer, manager, specialist) count half, so "Backend Engineer" and "Frontend Engineer" score only 33.
- **Qualifications only (US-06).** Embeddings are built from the same text as TF-IDF: headline, summary, skills, titles, bullets, degrees and certifications. A test checks that a name, contact details and a birth date leave both the embedding text and the score unchanged.
- **`score_explanations`** has one plain sentence per component, for example "Has 1.5 years of experience, below the 3 years the job asks for." or "Closest job title: Data Analyst (title fit 100/100, seniority aside).".

## Weights

The weights live in `weights.yaml`, together with `model_version`, the skill weights, the embedding model and its revision, and the cosine range. The file is checked when the package is imported: all five components must be listed, the weights must add up to 1, and the nice-to-have skill weight must be below the required one. **Change `model_version` whenever anything in the file changes.**

How the values were chosen:

1. **Start from reasoning:** skills first, then embeddings, then experience and title, with TF-IDF last, because embeddings cover meaning better. The starting point was 0.35 / 0.25 / 0.15 / 0.15 / 0.10.
2. **Ablation** (below): embedding similarity alone is the best single signal, as in L-6, and exact-match skill overlap alone is weaker than either text measure.
3. **Moved weight to embeddings** (0.25 to 0.35), from skills (0.35 to 0.30) and experience (0.15 to 0.10). Three weightings in that direction gave the same per-job Spearman (0.809) and NDCG@10 (0.985), and an all-pairs Spearman between 0.734 and 0.740. The ranking is not sensitive to the exact values. The one closest to the starting point was kept.

| Skill / embedding / experience / title / text | Spearman all | Spearman per job | NDCG@10 |
|---|---|---|---|
| 0.35 / 0.25 / 0.15 / 0.15 / 0.10 (start) | 0.725 | 0.770 | 0.983 |
| **0.30 / 0.35 / 0.10 / 0.15 / 0.10 (kept)** | **0.739** | **0.809** | **0.985** |
| 0.30 / 0.40 / 0.10 / 0.10 / 0.10 | 0.740 | 0.809 | 0.985 |
| 0.25 / 0.40 / 0.10 / 0.15 / 0.10 | 0.734 | 0.809 | 0.985 |

The weights were **not** searched to maximize the metrics. With 30 pairs and one rater, a search would fit this rater and these 3 jobs. Skills keep the second-largest weight even though leaving them out scores slightly higher on this set. They are the part a recruiter can check ("has 4 of 6 required skills"), and exact matching will improve when the scorer uses L-11 normalization.

## Embeddings offline

The model runs on the local CPU. Only the one-off download uses the network:

```bash
pip install -e "ml/[embeddings]"        # sentence-transformers and PyTorch, about 2 GB
python -m ats_scoring.embeddings download --to /models/multilingual-e5-small
export ATS_EMBEDDING_MODEL_DIR=/models/multilingual-e5-small
```

- **Pinned:** `download` fetches the revision named in `weights.yaml` (`614241f6…`) and writes a marker file. `Embedder` refuses a folder whose marker names another model or revision, so every embedding in the system comes from the same model files.
- **No network after that:** `Embedder` loads the folder with `local_files_only=True`. A test and the benchmark block sockets while loading and embedding, and both still work.
- **Reproducible:** a CV gives the same vector alone or in a batch (largest difference measured: 0), and two evaluation runs give byte-identical scores.
- **e5 prefixes:** `query: ` for jobs and `passage: ` for CVs, added by `Embedder`.

### For the backend (when scoring is wired in)

```python
from ats_scoring import score
from ats_scoring.embeddings import Embedder

embedder = Embedder()                        # once per worker; about 2 s
candidate.embedding = embedder.embed_candidate(candidate.parsed_data)   # after parsing
job.embedding = embedder.embed_job(job_fields)                          # on create/update

result = score(candidate.parsed_data, job_fields,
               candidate_embedding=candidate.embedding, job_embedding=job.embedding)
```

- `candidates.embedding` and `jobs.embedding` are already `vector(384)`. Store the model and revision next to them, or re-embed every row when `weights.yaml` changes the model.
- Re-embed a job when its title, description or skills change, and a CV when a recruiter corrects its parsed data (B-14).
- `job_fields` now also uses `min_experience_years`.
- Without embeddings, `score()` still works and spreads the embedding weight over the other components. That is the fallback while the worker cannot run the model, for example on staging, which has no worker (L-8).

Proposed mapping to the `scores` table (backend to confirm):

| `score()` returns | Column |
|---|---|
| `total` | `overall_score` |
| `components["skill_overlap"]` | `skill_overlap_score` |
| `components["embedding_similarity"]`, or `text_similarity` when it is `None` | `semantic_score` (not nullable) |
| `components["experience_fit"]` | `experience_score` |
| `components["title_similarity"]` | `title_fit_score` |
| `components`, `weights`, `matched_skills`, `missing_skills`, `score_explanations` | `component_breakdown` |
| `model_version` | `model_version` |

## Speed

`python benchmarks/time_scoring.py --data <synthetic output with --cvs 1000> --model-dir <model>`: 1,000 distinct synthetic CVs against job J01, network blocked throughout. Measured on an Apple M5 (10 cores, 24 GB), macOS 26.7, Python 3.12.16, PyTorch 2.15, sentence-transformers 6.2. Two runs:

| Step | Time | How often |
|---|---|---|
| Rank 1,000 candidates, with embeddings (score each, then sort) | 0.52 s (0.52 ms each) | Every ranking |
| Rank 1,000 candidates, without embeddings | 0.49-0.50 s | Every ranking |
| Load the model | 2.3 s | Once per worker |
| Embed 1,000 CVs and the job | 16.4 s (16.4 ms per CV) | Once per CV |

Almost all of the ranking time is TF-IDF, which fits a vectorizer for every pair. The embedding comparison adds about 0.03 ms per candidate. L-6 measured 86 ms per CV on older hardware, so expect 3 to 5 times slower embedding on a typical laptop or a small cloud CPU.

## Evaluation (L-9 set: 30 pairs, 3 jobs, 1 rater)

`python -m ats_scoring.evaluate` (uses the committed `ml/evaluation/data/embeddings.json`):

| Metric | L-7 baseline | Hybrid, no embeddings | **Hybrid** |
|---|---|---|---|
| Spearman, all pairs | 0.701 | 0.723 | **0.739** |
| Spearman, mean per job | 0.740 | 0.738 | **0.809** |
| NDCG@10, mean per job | 0.982 | 0.971 | **0.985** |
| NDCG@10, random order | 0.784 | 0.784 | 0.784 |

Per job (hybrid against baseline): J01 Spearman 0.833 against 0.699, J07 0.684 against 0.612, J10 0.909 against 0.909.

**How much of this is noise.** A paired bootstrap, resampling candidates within each job 5,000 times, gives the hybrid's gain over the baseline:

| Metric | Gain | 95% interval |
|---|---|---|
| Spearman, all pairs | +0.037 | -0.013 to +0.106 |
| Spearman, mean per job | +0.070 | 0.000 to +0.233 |
| NDCG@10 | +0.005 | 0.000 to +0.023 |

The per-job gain is never below zero, but the all-pairs interval includes zero. NDCG@10 was already 0.98, so there was little room to improve it. Read this as "better at ordering candidates within a job, otherwise no worse", not as a large improvement.

### Ablation

`python evaluation/ablation.py`:

| Variant | Spearman all | Spearman per job | NDCG@10 |
|---|---|---|---|
| **All (weights.yaml)** | **0.739** | **0.809** | **0.985** |
| Only skill overlap | 0.640 | 0.695 | 0.971 |
| Only embedding similarity | 0.742 | 0.834 | 0.990 |
| Only experience fit | 0.463 | 0.519 | 0.898 |
| Only title similarity | 0.580 | 0.656 | 0.895 |
| Only text similarity (TF-IDF) | 0.730 | 0.734 | 0.969 |
| All but skill overlap | 0.755 | 0.832 | 0.969 |
| All but embedding similarity | 0.723 | 0.738 | 0.971 |
| All but experience fit | 0.715 | 0.794 | 0.984 |
| All but title similarity | 0.733 | 0.809 | 0.985 |
| All but text similarity | 0.731 | 0.809 | 0.985 |

- **Embedding similarity** carries most of the gain. Removing it brings the per-job Spearman back to the baseline's level.
- **Embedding similarity alone is about as good as the full scorer** on this set. The other components still matter in the product: they give recruiters checkable reasons (skills, years, title), and they keep scoring working when there is no embedding.
- **Experience fit** adds to the per-job ranking (0.794 to 0.809). **Title similarity** and **TF-IDF** add little here, because the embedding already captures most of what they measure.

### Why J07 (Data Analyst) stays the weakest job

Every component ranks C003, a Senior Data Scientist rated 0, above C008, a Product Manager rated 3 who lists Data Analysis, KPI Definition and Product Analytics. The data scientist's CV is closer in skills, wording, meaning and title. The rating reflects a judgement about the role, not something in the CV text. No reweighting fixes this, and tuning toward it would fit one rater's view. A second rater (recommended in [evaluation.md](evaluation.md)) would show whether others agree.

## Limits

- **30 pairs, 3 jobs, 1 rater.** The bootstrap above shows how wide the uncertainty is. The ratings were made before L-13 existed, so the weights could not shape them, but the same person built the scorer and rated the pairs.
- **The scorer reads the generator's parsed data,** so parsing errors are not tested. On real CVs, missing `experience_years` or titles make components `None` more often.
- **Skills are still matched as exact strings after a small alias table.** "Tableau" does not match "Power BI", and "Data Analysis" does not match "Data Visualization". Using the L-11 normalizer and ESCO concepts in the scorer is the next step, and needs a new `model_version`.
- **The cosine range [0.80, 0.95] was measured on synthetic CVs.** Real CVs are longer and messier. Check the range on real data before relying on the embedding score as an absolute number. The ranking does not depend on it.
- **Titles:** the synonym table is small and English only. A title the table does not know, such as "Insights Lead", matches nothing, even where the embedding sees a link.
- **Experience** relies on the CV's total `experience_years`. It does not tell relevant years from years in another field.
- **The total is a ranking score, not a probability.** Compare it within a job. Totals are only roughly comparable across jobs, because different jobs leave different components `None`.
