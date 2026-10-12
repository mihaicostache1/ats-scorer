# ML

| Folder | What it is |
|---|---|
| `ats_scoring/` | The scoring package the backend imports. Installed with `pip install -e ml/` |
| `tests/` | Unit tests for `ats_scoring` |
| `synthetic/` | Script that generates the synthetic CV and job dataset ([README](synthetic/README.md)) |
| `embedding_spike/` | Experiments behind the embedding-model decision ([README](embedding_spike/README.md)) |

## ats_scoring

Scores how well a parsed CV fits a job. The first version is a baseline: skill-keyword overlap plus TF-IDF text similarity.

### Install

From the repository root:

```bash
pip install -e ml/            # the package
pip install -e "ml/[dev]"     # plus pytest, ruff and jsonschema
```

### Use

```python
from ats_scoring import score

candidate = {
    "headline": "Backend Developer",
    "summary": "Builds REST services in Python.",
    "skills": ["python", "Postgres", "Git"],
}
job = {
    "title": "Backend Developer",
    "description": "Build and maintain REST services in Python with PostgreSQL.",
    "required_skills": ["Python", "PostgreSQL", "Docker", "REST APIs"],
    "preferred_skills": ["Redis", "Kafka"],
}

score(candidate, job)
# {
#     "total": ...,                      # 0-100
#     "components": {"skill_overlap": 40.0, "text_similarity": ...},
#     "matched_skills": ["Python", "PostgreSQL"],
#     "missing_skills": ["Docker", "REST APIs"],
#     "model_version": "tfidf-skills-0.1.0",
# }
```

`candidate` follows the draft parsed-CV schema, described in [docs/ml/parsed-cv-schema.md](../docs/ml/parsed-cv-schema.md). `job` uses the job fields of the API.

### How the score is built

| Component | Weight | How it is computed |
|---|---|---|
| `skill_overlap` | 0.6 | Share of the job's skills found in the candidate's skill list. A preferred skill counts half as much as a required one |
| `text_similarity` | 0.4 | TF-IDF cosine similarity between the CV text and the job text, on single words and word pairs |

- **Skills are compared after normalization:** case, spacing and list bullets are ignored, and a small alias table resolves abbreviations such as `JS`, `Postgres` and `k8s`.
- **`matched_skills`** lists the job's skills the candidate has, required ones first, in the job's spelling. **`missing_skills`** lists the required skills the candidate lacks.
- **Only qualifications are read:** headline, summary, skills, job titles and descriptions, degrees and certifications. Names, contact details, employers, schools and dates never reach the score.
- **A job with no skills** is scored on text alone, and `skill_overlap` is `None`.
- **Nothing to score is an error:** `score()` raises `ValueError` when the candidate or the job has no skills and no text. A CV that failed to parse must not look like a poor candidate.

### Limits of the baseline

- A skill counts only if it is in the candidate's skill list. A skill mentioned only in the CV's free text is not matched.
- Skills are compared as text, so synonyms outside the alias table do not match ("Kubernetes" and "container orchestration").
- The TF-IDF weights come from the two texts being compared, not from a larger collection, and the stop-word list is English.
- Experience and job-title fit are not scored yet.

Change `MODEL_VERSION` in `ats_scoring/scoring.py` whenever the same input could get a different score.

### Test

```bash
cd ml
ruff check .
ruff format --check .
pytest
```
