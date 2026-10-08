# L-6 spike: embedding model and ESCO skill matching

Two throwaway experiments that feed the decision in [docs/ml/embedding-model-and-skill-matching.md](../../docs/ml/embedding-model-and-skill-matching.md):

- `compare_models.py` compares `all-MiniLM-L6-v2` with the multilingual `multilingual-e5-small` on ranking quality and CPU speed.
- `esco_match.py` maps free-text skills to ESCO concepts with exact, fuzzy and embedding matching.

This is spike code. It is here so the numbers can be reproduced, not to be imported by the product.

## Setup

Needs Python 3.11 or newer and about 2 GB of disk for PyTorch and the two models.

```bash
cd ml/embedding_spike
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

The models download from Hugging Face on first use (about 90 MB and 470 MB).

## 1. Compare the models

```bash
python compare_models.py
```

Expect this to take several minutes on a laptop CPU. It writes `results/model_comparison.md` and `.json` with:

- embedding dimension, parameter count, token limit and the share of CVs each model cuts short
- time to embed 1,000 synthetic CVs in batches, and one at a time
- ranking quality for English jobs against English CVs (P@10, MRR, nDCG@10)
- P@10 for German, French and Romanian job summaries against the English CVs

Add `--ratings path/to/ratings.csv` once human ratings exist, to get nDCG@10 against them. `--threads N` limits the CPU threads, to imitate a small server.

## 2. Match skills against ESCO

ESCO does not offer a direct download link, so get the file once by hand:

1. Open <https://esco.ec.europa.eu/en/use-esco/download>.
2. Choose version **v1.2.1**, content **classification**, language **en**, file type **CSV**.
3. Accept the privacy statement and enter an email address. The download link arrives by email.
4. Unzip it and copy `skills_en.csv` to `ml/embedding_spike/data/skills_en.csv` (git-ignored).

```bash
python esco_match.py --esco data/skills_en.csv
python esco_match.py --esco data/skills_en.csv --model e5-small
```

Each run writes `results/esco_matching_<model>.md` and `.json` with:

- how many of the dataset's skills each matcher finds in ESCO
- a table of awkward inputs ("JS", "k8s", "Postgres", typos, other languages) showing what each matcher returns
- the dataset skills that had no exact match, for manual review

The first run per model embeds all ESCO skill labels, which can take a few minutes. Later runs use the cache in `results/cache/`.

## What to commit

Commit the files in `results/` (not the cache). They are the evidence behind the write-up.
