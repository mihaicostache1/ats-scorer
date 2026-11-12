# ML

| Folder | What it is |
|---|---|
| `ats_scoring/` | The scoring package the backend imports. Installed with `pip install -e ml/` |
| `tests/` | Unit tests for `ats_scoring` |
| `benchmarks/` | Speed measurement for the scorer and the skill normalizer |
| `evaluation/` | Hand-rated candidate/job pairs and evaluation results ([how it works](../docs/ml/evaluation.md)) |
| `synthetic/` | Script that generates the synthetic CV and job dataset ([README](synthetic/README.md)) |
| `embedding_spike/` | Experiments behind the embedding-model decision ([README](embedding_spike/README.md)) |

## ats_scoring

Scores how well a parsed CV fits a job. Version 1 (`hybrid-1.0.0`, L-13) mixes skill overlap, embedding similarity, experience fit, title similarity and TF-IDF text similarity. Design, evaluation and timing: [docs/ml/hybrid-scorer.md](../docs/ml/hybrid-scorer.md).

### Install

From the repository root:

```bash
pip install -e ml/                  # the package (scoring needs nothing more)
pip install -e "ml/[dev]"           # plus pytest, ruff and jsonschema
pip install -e "ml/[embeddings]"    # to compute embeddings: sentence-transformers and PyTorch, about 2 GB
```

### Use

```python
from ats_scoring import score

candidate = {
    "headline": "Backend Developer",
    "summary": "Builds REST services in Python.",
    "skills": ["python", "Postgres", "Git"],
    "experience_years": 1.5,
}
job = {
    "title": "Senior Backend Engineer",
    "description": "Build and maintain REST services in Python with PostgreSQL.",
    "required_skills": ["Python", "PostgreSQL", "Docker", "REST APIs"],
    "preferred_skills": ["Redis", "Kafka"],
    "min_experience_years": 3,
}

score(candidate, job, candidate_embedding=cv_vector, job_embedding=job_vector)
# {
#     "total": ...,                                   # 0-100
#     "components": {
#         "skill_overlap": 40.0,
#         "embedding_similarity": ...,                # None without both embeddings
#         "experience_fit": 50.0,                     # 1.5 of 3 years
#         "title_similarity": 100.0,                  # seniority words are ignored
#         "text_similarity": ...,
#     },
#     "weights": {"skill_overlap": 0.3, "embedding_similarity": 0.35, ...},
#     "matched_skills": ["Python", "PostgreSQL"],
#     "missing_skills": ["Docker", "REST APIs"],
#     "score_explanations": ["Has 2 of 4 required skills.", ...],
#     "model_version": "hybrid-1.0.0",
# }
```

`candidate` follows the parsed-CV schema (version 1.1, also accepting 1.0, with `ParsedCV` models in `ats_scoring.parsed_cv`), described in [docs/ml/parsed-cv-schema.md](../docs/ml/parsed-cv-schema.md). The scorer also still reads the older draft shape that the synthetic data uses, where skills are plain strings and positions are in `work_history`. `job` uses the job fields of the API.

The embeddings come from `ats_scoring.embeddings.Embedder`, computed once per CV and per job and stored. `score()` never loads a model and makes no network call. Without embeddings it still works, and the embedding weight is shared among the other components.

```bash
python -m ats_scoring.embeddings download --to models/multilingual-e5-small   # once; the only network step
export ATS_EMBEDDING_MODEL_DIR=$PWD/models/multilingual-e5-small
```

```python
from ats_scoring.embeddings import Embedder

embedder = Embedder()  # loads from ATS_EMBEDDING_MODEL_DIR, offline
cv_vector = embedder.embed_candidate(candidate)
job_vector = embedder.embed_job(job)
```

### How the score is built

The weights, the model version and the embedding model live in [`ats_scoring/weights.yaml`](ats_scoring/weights.yaml).

| Component | Weight | How it is computed |
|---|---|---|
| `skill_overlap` | 0.30 | Share of the job's skills found in the CV's skill list. A required skill weighs 1.0, a nice-to-have one 0.5 |
| `embedding_similarity` | 0.35 | Cosine of the e5-small embeddings of the CV and the job, mapped from [0.80, 0.95] to 0-100 |
| `experience_fit` | 0.10 | 100 when `experience_years` meets `min_experience_years`, falling linearly to 0. More years are not penalized |
| `title_similarity` | 0.15 | Word overlap of the job title with the CV's headline and position titles, without seniority words |
| `text_similarity` | 0.10 | TF-IDF cosine similarity between the CV text and the job text, on single words and word pairs |

- **A component that cannot be computed is `None`,** and its weight is shared among the others. `weights` in the result shows the weights actually used. Examples: no embeddings, no skills on the job, no minimum experience (or a minimum of 0), no years on the CV.
- **Skills are compared after normalization:** case, spacing and list bullets are ignored, and a small alias table resolves abbreviations such as `JS`, `Postgres` and `k8s`.
- **`matched_skills`** lists the job's skills the candidate has, required ones first, in the job's spelling. **`missing_skills`** lists the required skills the candidate lacks.
- **Only qualifications are read:** headline, summary, skills, job titles and descriptions, total years of experience, degrees and certifications. Names, contact details, employers, schools and dates never reach the score or the embedding.
- **`score_explanations`** are short sentences for the recruiter-facing breakdown, one per component.
- **Nothing to score is an error:** `score()` raises `NothingToScoreError`, a `ValueError` subclass, when the candidate or the job has no skills and no text. A CV that failed to parse must not look like a poor candidate.
- **Deterministic:** the same inputs give the same result. The embedding model is pinned to one revision.

Change `model_version` in `weights.yaml` whenever the same input could get a different score, for example when the weights, the embedding model or the alias table change.

### Limits

- Skills count only from the CV's skill list, matched as text after the alias table. Synonyms outside it do not match ("Tableau" and "Power BI").
- The cosine range was measured on synthetic CVs. Check it on real CVs before reading the embedding score as an absolute number.
- The title synonym table is small and English only, and the TF-IDF stop-word list is English.
- More in [docs/ml/hybrid-scorer.md](../docs/ml/hybrid-scorer.md#limits).

### Skill normalization

`ats_scoring.skill_normalizer` maps CV skills to canonical names and ESCO concepts (`normalize_skills`) and finds skills in free text (`extract_skills`), for the CV parser. It needs ESCO's skills file, downloaded separately. Usage, ESCO licence and limits: [docs/ml/skill-normalization.md](../docs/ml/skill-normalization.md).

```python
from ats_scoring.esco import load_esco
from ats_scoring.skill_normalizer import SkillNormalizer

normalizer = SkillNormalizer(load_esco("skills_en.csv"))
normalizer.normalize_skills(["JS", "k8s"])  # JavaScript (ESCO), Kubernetes (not in ESCO)
```

### Job description parsing

`ats_scoring.job_parser.parse_job_description` reads required and nice-to-have skills, the minimum years of experience and the seniority from a job's text, for the backend to suggest a job's fields. If the text has no detectable sections, every skill counts as required. Output format and rules: [docs/ml/job-description-parsing.md](../docs/ml/job-description-parsing.md).

```python
from ats_scoring.job_parser import parse_job_description

parse_job_description(description, title="Senior Backend Engineer").to_dict()
# {"required_skills": [...], "preferred_skills": [...], "min_experience_years": 5,
#  "seniority": "senior", "seniority_source": "title", "sections_detected": True, ...}
```

### Evaluate

`python -m ats_scoring.evaluate` compares a scorer's results with human ratings of 30 candidate/job pairs, and reports Spearman correlation and NDCG@10. It reads precomputed embeddings from `evaluation/data/embeddings.json`, so it needs no PyTorch. `python evaluation/ablation.py` scores each component alone and the scorer without each one. See [docs/ml/evaluation.md](../docs/ml/evaluation.md).

### Speed

`benchmarks/time_scoring.py` ranks synthetic CVs against one job, as the backend worker will, with network access blocked. It needs the synthetic dataset (see [synthetic/README.md](synthetic/README.md)):

```bash
cd ml
python synthetic/generate.py --cvs 1000 --out /tmp/synth1000
python benchmarks/time_scoring.py --data /tmp/synth1000 --model-dir models/multilingual-e5-small
```

On an Apple M5: ranking 1,000 candidates takes about 0.5 s, and embedding 1,000 CVs takes about 16 s (once per CV). Full results: [docs/ml/hybrid-scorer.md](../docs/ml/hybrid-scorer.md#speed).

### Test

```bash
cd ml
ruff check .
ruff format --check .
pytest
ATS_EMBEDDING_MODEL_DIR=$PWD/models/multilingual-e5-small pytest tests/test_embeddings.py   # also the real-model tests
```

CI runs without PyTorch: the embedder tests use a stand-in for the model, and the real-model tests are skipped.
