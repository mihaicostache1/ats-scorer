# Embedding model and skill matching (L-6)

**Status:** measured on 2026-10-08. Owner: ML/DevOps lead.
Evidence and how to reproduce: [ml/embedding_spike](../../ml/embedding_spike/README.md), result files in `ml/embedding_spike/results/`.

## 1. Embedding model

**Chosen: `intfloat/multilingual-e5-small`.** It outputs **384 dimensions**, so `candidates.embedding` and `jobs.embedding` stay `vector(384)`, and it takes about **86 ms per CV** on CPU.

| | all-MiniLM-L6-v2 | multilingual-e5-small |
|---|---|---|
| Embedding dimension | 384 | 384 |
| Parameters | 22.7M | 117.7M |
| Token limit per text | 256 | 512 |
| Synthetic CVs cut short by the limit | 54% | 1% |
| 1,000 CVs in batches of 32 (median of 3 passes) | 31 s | 86 s |
| Time per CV, in a batch | 31 ms | 86 ms |
| Time per CV, one at a time (median) | 40 ms | 94 ms |
| English: P@10 same role family | 0.975 | 0.915 |
| English: nDCG@10, silver labels | 0.855 | 0.906 |
| P@10 with a German job text | 0.91 | 0.96 |
| P@10 with a French job text | 0.83 | 0.87 |
| P@10 with a Romanian job text | 0.74 | 0.92 |

Test machine: AMD CPU (family 25, model 68), 16 logical cores, 8 torch threads, Windows 11, Python 3.14, torch 2.14.1, sentence-transformers 6.1.0. Data: 100 synthetic CVs and 20 jobs for quality, 1,000 synthetic CVs for speed.

**Why e5-small:**

- **It reads almost the whole CV.** MiniLM ignores everything after 256 tokens, which cut off 54% of our synthetic CVs. Real CVs are longer.
- **It handles other languages better,** most clearly Romanian (0.92 against 0.74).
- **English quality is comparable.** It is better on graded ranking and slightly worse at keeping other role families out of the top 10.
- **It is fast enough:** 1,000 CVs in 86 seconds.

**What it costs:** five times the parameters (about 470 MB to download instead of 90 MB), about 2.8 times slower in batches, and it needs prefixes (`query: ` for jobs, `passage: ` for CVs). Leaving them out lowers quality without any error.

**Revisit if** the product stays English-only: MiniLM is then the lighter choice. Switching to a model with another dimension means a migration and re-embedding every row.

**Limits of this test:**

- The data is small and synthetic. Silver labels are rules computed from the generator's ground truth, not human ratings. Differences of a few hundredths are too small to rely on.
- The three batch passes agreed closely: 29.9 to 30.7 s for MiniLM and 85.3 to 87.3 s for e5-small.
- The machine used 8 threads. A small server will be slower: measure with `--threads 2`.

**For the implementation:** store the model name and version with every embedding. Embed qualifications only, without name, contact details or dates (US-06). e5-small gives even unrelated skill strings about 0.85 cosine, so rank by similarity and do not use a fixed cut-off.

## 2. Skill normalization

Extracted skills are mapped to ESCO in this order. The first step that succeeds wins.

1. **Clean:** Unicode-normalize, lower-case, collapse spaces, trim bullets and trailing punctuation. Keep `#`, `+`, `.` and `/`.
2. **Alias table:** a small hand-kept list (`js` → `javascript`, `ml` → `machine learning`). Every target must exist in ESCO.
3. **Exact match** on ESCO preferred, alternative and hidden labels, also without the bracketed qualifier (`Python (computer programming)` → `python`). Accepted automatically.
4. **Fuzzy match** (edit-distance similarity of 90/100 or more, 4+ characters). Shown as a suggestion on the review screen (US-05).
5. **Embedding match** (nearest ESCO labels). Also a suggestion only.
6. **Otherwise** the skill stays as free text. It still counts when a job lists the same string.

Each skill keeps its original string, the ESCO URI if there is one, the method and the score. Version 1 can ship with steps 1-3 and 6. Steps 4 and 5 need confirmed matches to tune on first.

**ESCO covers our skills poorly.** Of the 174 skills in the synthetic dataset, 55 (32%) match an ESCO label exactly, and about 45% have no acceptable match by any method. Docker, Kubernetes, Django, Redis, pandas and FastAPI are not in ESCO (13,960 skills, 101,782 labels).

**Failures seen in the prototype:**

| Input | What happened | Lesson |
|---|---|---|
| `JS` | No exact match. Fuzzy's best guess is "JSSS" (67). MiniLM finds JavaScript (0.83), e5-small picks "JSSS" (0.94) | Abbreviations need the alias table |
| `ML` | Exact match is "ML (computer programming)", a programming language | The alias table runs before exact match |
| `Docker`, `k8s` | Not in ESCO. Embedding suggests "dock operations" for Docker (0.76 and 0.90) | Keep as free text. Never force a match |
| `React`, `Scrum` | Exact match, but to a broad concept: "JavaScript Framework", "ICT project management methodologies" | Keep the original string next to the ESCO concept |
| `Video Production` | Fuzzy accepts "viticulture" (90.3) | Fuzzy matches are suggestions, not automatic |
| `Playwright`, `Unit Testing` | Embedding picks look-alikes: "work with playwrights" (0.84 and 0.94), "test electronic units" (e5-small, 0.93) | Embedding matches are suggestions. A cosine cut-off does not separate right from wrong |
| `Teamfähigkeit`, `învățare automată` | MiniLM fails both. e5-small finds "work in teams" for the first (0.87, under its 0.90 cut-off) and "e-learning" for the second | For other languages, load ESCO's own labels in that language |

For short skill strings MiniLM gave more sensible suggestions than e5-small: on a manual read of the accepted embedding matches, about 6 of 37 were clearly wrong for MiniLM and about 15 of 42 for e5-small.
