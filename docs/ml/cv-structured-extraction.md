# CV structured extraction (B-13)

B-12, L-10 and L-11 are merged prerequisites. The existing `extract_cv_text` Arq job
now runs text extraction followed by structured parsing; no second Redis enqueue is
needed between the steps. Run migrations through `006_cv_structured_extraction`.

## Parser behavior

`api/app/services/cv_parser.py` detects section headings, including inline headings,
and handles bullet lists, PDF line wrapping, tables and the synthetic plain layout.
It reads email and phone with regexes, uses spaCy `en_core_web_sm` for PERSON/ORG
entities, and uses heading structure to associate job titles, employers and schools.
A plausible name that NER did not identify is retained with low confidence. Dates
accept `YYYY-MM`, `MM/YYYY`, numeric month/year with dots or dashes, named months,
years, and current-position markers. Year-only dates use January with confidence
0.6 so the inferred month requires review. Missing dates stay null. Total experience
merges overlapping date intervals rather than counting simultaneous jobs twice.

Explicit skill lists go through L-11 `normalize_skills`. Unrecognized skills keep
their raw text with `normalized: null`; fuzzy and embedding suggestions are never
accepted. When no skills list exists, L-11 `extract_skills` reads summary/experience
text. Contact text is excluded from that fallback. Duplicates are removed while
keeping the first written form. A lock protects shared spaCy/normalizer calls.

The parser returns the shared `ParsedCV` model, version 1.0, with `source: parser`.
It revalidates its JSON representation before returning; persistence validates again.
Tests validate against the L-10 JSON Schema and check that confidence pointers resolve.
Birth date, nationality, gender and marital-status lines are excluded from parsing.

## Persistence, status and retries

The final transaction writes `candidates.parsed_data`, a separate copy in
`candidates.parsed_data_original`, `candidates.raw_text`, and `cv_documents.status`.
The snapshot represents the parser output for the newest uploaded CV and is kept
separately for B-14 recruiter edits. A delayed older job may finish its document's
status but cannot replace candidate data. Terminal jobs are skipped on redelivery,
so they cannot overwrite a recruiter correction. Canonical candidate name/email/
phone/location columns are left for B-14 to accept.

The review policy sends a record to `needs_review` if name or email is missing, if
there are no skills/experiences/education, or if any emitted confidence is below
`CV_REVIEW_CONFIDENCE_THRESHOLD` (default 0.75). An absent phone alone is acceptable.
Unknown skill normalization has confidence 0.6; multiple distinct emails or phones
have confidence 0.5. A date range with end before start has confidence 0.3. These are
heuristic review signals, not calibrated probabilities. Otherwise status is `parsed`.

`extracted` is an intermediate checkpoint. Parsing errors/timeouts reuse its saved
text on retry, including on B-12 documents that were already `extracted`. The existing
three-attempt policy applies to the whole job. A missing model fails with
`parser_unavailable`; parsing timeouts use `parsing_timeout`. Invalid schema output
never commits either JSON snapshot. `CV_PARSING_TIMEOUT_SECONDS` defaults to 60;
the worker's outer limit includes both extraction and parsing time.

## Installation

From `api/`, run `pip install -r requirements-dev.txt` and `alembic upgrade head`.
Requirements install `ml/`, spaCy 3.8 and the checksum-pinned
[`en_core_web_sm` 3.8.0](https://github.com/explosion/spacy-models/releases/tag/en_core_web_sm-3.8.0)
wheel. Model loading follows [spaCy's package guidance](https://spacy.io/usage/models).
There are no model downloads during processing. Docker and Render build with the
repository root as context, using `api/Dockerfile`.

Set `ESCO_SKILLS_CSV` in the worker's environment to enable the taxonomy, using
paths separated by `os.pathsep`. See [L-11 setup and attribution](skill-normalization.md).
Without it, L-11 uses aliases and leaves other skills unnormalized. Invalid configured
paths fail rather than silently falling back. Embedding suggestions are not enabled.

## Accuracy and proposed targets

**Lead agreement: pending.** On 2026-11-01 the task owner chose to use these proposed
targets while awaiting the lead's agreement. No lead approval is asserted.

| Metric | Proposed minimum | Measured |
|---|---:|---:|
| Email exact match, ignoring case | 98% | 100/100 (100%) |
| Phone exact match after removing formatting | 98% | 100/100 (100%) |
| Skills micro-F1 | 90% | 100% |

The benchmark uses all 100 synthetic PDFs (seed 42, generator 1.0.0, reference year
2026): 43 classic, 29 two-column, 14 table and 14 plain. Each layout achieved 100%
on all three metrics. Skills compare deduplicated, case/spacing-cleaned raw labels
against the ground-truth skill list: 1,044 true positives, zero false positives,
zero false negatives. This measures extraction; it does **not** measure whether
canonical ESCO names are correct. It runs the real B-12 PDF extraction and spaCy
pipeline, and only uses JSON truth after parsing the PDF.

The run used L-11 aliases without ESCO. All 100 records required review under the
conservative policy (unknown normalizations, year-only dates or header-name fallback).
Correct email/phone/skill extraction does not imply that a complete CV is ready for
automatic acceptance. These templates are an easy synthetic baseline, not a measure
of accuracy on real CVs or scans. Review routing and name/organization/date accuracy
need a separate representative labeled set before changing the confidence policy.

The [machine-readable report](../../ml/evaluation/results/2026-11-01_cv-parser-0.1.0.json)
records package versions, dataset fingerprint, counts and per-layout results.
To reproduce, from the repository root with the backend environment active:

```bash
pip install -r ml/synthetic/requirements.txt
python ml/synthetic/generate.py --seed 42 --cvs 100 --jobs 20 --year 2026 --out /tmp/ats-b13-synthetic
cd api
python -m scripts.evaluate_cv_parser --dataset /tmp/ats-b13-synthetic \
  --output ../ml/evaluation/results/2026-11-01_cv-parser-0.1.0.json --enforce-targets
```

`--enforce-targets` returns a nonzero status on a proposed target miss. The report
retains the pending-agreement label. The lead should confirm or amend the target
table during review; no automatic quality gate is claimed as agreed policy.
