# Job description parsing

**Status:** implemented (L-12), not yet called by the API. Owner: ML/DevOps lead.
Meant for the backend in week 5, to suggest a job's skills and experience from its description.

| What | Where |
|---|---|
| Code | [ml/ats_scoring/job_parser.py](../../ml/ats_scoring/job_parser.py) |
| Tests | [ml/tests/test_job_parser.py](../../ml/tests/test_job_parser.py) |
| Test descriptions | [ml/tests/fixtures/jobs](../../ml/tests/fixtures/jobs) (20 synthetic), [ml/tests/fixtures/job_descriptions](../../ml/tests/fixtures/job_descriptions) (7 hand-written) |

## What it does

`parse_job_description(text, title=None)` reads a job description and returns:

- the **required** and **nice-to-have** skills
- the **minimum years of experience**
- the **seniority**: `junior`, `mid`, `senior` or `lead`

It uses rules and the [skill normalizer](skill-normalization.md) (L-11), not a model. It is fast (no downloads, no GPU) and gives the same result for the same text.

## Use (backend, week 5)

```python
from ats_scoring.job_parser import parse_job_description

parsed = parse_job_description(job.description, title=job.title)
parsed.to_dict()   # JSON, see below
```

- Pass `title` when the job has one. Without it, a short first line of the text is taken as the title, unless it is a bullet.
- By default the shared normalizer is used (`default_normalizer()`, built from `$ESCO_SKILLS_CSV`, alias table only without it). Pass `normalizer=` to reuse the parser worker's own. Like the normalizer, a call is **not thread-safe**: call it under the same lock as the CV parser.
- The result is a **suggestion**. Show it in the job form for the recruiter to confirm or edit (US-01). Do not overwrite skills a recruiter has entered.

### Mapping to the job API

| Parser field | Job field (`docs/openapi.yaml`) | Note |
|---|---|---|
| `required_skills` | `required_skills` | Same type: list of strings |
| `preferred_skills` | `preferred_skills` | Same type: list of strings |
| `min_experience_years` | `min_experience_years` | `null` when the text states none: leave the field empty or use 0, do not invent a value |
| `seniority` | none yet | Show it as a hint, or add a field to the contract first |

## Output format

`ParsedJob.to_dict()` returns this JSON (from [markdown_startup.txt](../../ml/tests/fixtures/job_descriptions/markdown_startup.txt), shortened):

```json
{
  "required_skills": ["Python", "Go", "PostgreSQL", "Redis", "AWS", "Lambda", "S3", "GCP"],
  "preferred_skills": ["Kubernetes", "Terraform"],
  "min_experience_years": 5,
  "seniority": "senior",
  "seniority_source": "title",
  "sections_detected": true,
  "skills": [
    {"raw": "Python", "normalized": "Python", "requirement": "required"},
    {"raw": "Lambda", "normalized": null, "requirement": "required"},
    {"raw": "Kubernetes", "normalized": "Kubernetes", "requirement": "preferred"}
  ],
  "parser_version": "jd-parser-0.1.1"
}
```

| Field | Type | Meaning |
|---|---|---|
| `required_skills` | string[] | Skills as written in the text, once each, in order of first mention |
| `preferred_skills` | string[] | Nice-to-have skills, same form. A skill that is also required appears only in `required_skills` |
| `min_experience_years` | integer ≥ 0 or `null` | The minimum asked for. `0` when the text says no experience is needed. `null` when it says nothing |
| `seniority` | `"junior"`, `"mid"`, `"senior"`, `"lead"` or `null` | `null` when there is no title cue, no text cue and no years |
| `seniority_source` | `"title"`, `"text"`, `"experience"` or `null` | Where `seniority` came from (see below). `"experience"` is a guess from the years |
| `sections_detected` | boolean | `false`: no required or nice-to-have section and no nice-to-have phrase was found, so **every skill counts as required**. The UI can say so |
| `skills` | object[] | The same skills with details: `raw` (as written), `normalized` (canonical name from the normalizer, `null` when unknown), `requirement` (`"required"` or `"preferred"`) |
| `parser_version` | string | Store it with the result. It changes whenever the same text could give a different result |

Skills are compared after normalization, so `JS` and `JavaScript` count once. The scorer normalizes skills again, so the strings as written can go straight into the job fields.

## How it works

### 1. Sections

The text is cut into lines, then sentences (also at `;`). Each piece gets a kind from the heading above it:

| Kind | Example headings | Skills |
|---|---|---|
| required | Requirements, What you bring, Must have, Your profile, Qualifications, Tech stack | Required |
| nice-to-have | Nice to have, Good to have, Bonus points, Preferred, Desirable | Nice-to-have |
| duties | Responsibilities, What you'll do, Tasks, About the role | Read only in the fallbacks below |
| other | About us, Benefits, What we offer, Location | Never read |
| unknown | text before any heading, or under an unknown heading | Required |

Headings are recognized in markdown (`## Requirements`, `**Requirements**`), in capitals, with or without a colon, and as a label at the start of a line (`Must have: Python, SQL`). A label on a bullet (`- Bonus: Kafka`) or inside a paragraph (`Location: Paris.`) applies to that bullet or sentence only.

Phrases inside a sentence override the heading:

- `is a plus`, `is an advantage`, `preferred`, `nice to have`, `desirable`, `optional`: the sentence is nice-to-have ("Experience with Go is a plus").
- `ideally`, `preferably`, `bonus if`: the rest of the sentence is nice-to-have ("Python and PyTorch; ideally also TensorFlow").
- `You will ...` and `You'll ...` (but not "You'll need ..." or "You will have ...") at the start of a sentence with no heading: the sentence is a duty.

### 2. Fallback when sections cannot be detected

If the text has **no required or nice-to-have heading and no nice-to-have phrase**, every skill in it counts as required, duty sentences included (`sections_detected: false`). Company and benefits sections are still left out.

In intro and duty text, the job title and team names ("our Quality Assurance team") are left out before searching for skills, so "We are looking for a Senior QA Automation Engineer" does not add "QA" as a skill. This is why `title` should be passed when it is known.

When sections are detected but the required and nice-to-have parts name no skill, the duties are read as required. Otherwise duties are ignored, because they mention teams and tasks more than skills ("work with product, frontend and QA").

### 3. Skills

- **Lists** after a lead-in ("experience with", "knowledge of", "confident with", "familiar with") and whole bullets under a required or nice-to-have heading are split at commas, `and`, `or`, `&` and parentheses. `Python/Go` is split when both halves are known skills, `CI/CD` and `A/B Testing` are not.
- An item counts when the normalizer recognizes it, or when it looks like a name: at most 4 words, each capitalized (`Mobile UI Design`, `KPI Definition`). Words like "strong", "solid", "fluent" and endings like "experience" or "certification" are removed first. An item ends at a preposition ("Python in production" gives `Python`); the text after it is searched for known skills, so "Python with Django" gives both. A part that states years ("Between 3 and 5 years") is never taken as a name.
- **Other text** is searched for skills the normalizer knows (alias table and ESCO preferred labels, see `extract_skills`).

### 4. Minimum experience

Patterns: `5+ years`, `3-5 years` and `between 3 and 5 years` (give 3), `at least two years'`, `minimum of three years`, `18 months` (gives 1), and `no (prior) experience required` (gives 0). Under a requirements heading any number of years counts ("5+ yrs Python"). Elsewhere the sentence must be about experience. Sentences with `ago`, `founded`, `contract` or `within` are skipped, as are nice-to-have sentences ("5+ years preferred") and company text. With several values, the highest is kept: "5+ years, 2+ with Kubernetes" gives 5.

### 5. Seniority

In this order, the first that gives a level wins:

1. **Title:** Lead, Head of, Principal, Staff engineer, Director → `lead`. Senior, Sr → `senior`. Mid, Medior, Intermediate → `mid`. Junior, Jr, Graduate, Entry-level, Intern, Trainee → `junior`. "Lead Generation" is not a level.
2. **Text:** the role in "we're looking for / hiring a ...", or "junior-level", "mid-level", "senior-level", "entry-level".
3. **Years:** under 2 → `junior`, 2 to 4 → `mid`, 5 to 7 → `senior`, 8 or more → `lead`, as in the synthetic generator.

## Testing

`cd ml && pytest tests/test_job_parser.py`

- **20 synthetic jobs** (`ml/synthetic/generate.py`, seed 42), in three writing styles: sections, prose and terse labels. Each has its expected skills, years and seniority. The test needs an exact match on all four, once with the alias table alone and once with the ESCO sample.
- **7 hand-written descriptions** imitating real postings: markdown with a company and perks section, capital headings, prose without sections (the fallback), `ideally` and `is a plus` inside bullets, European "Your profile / Desirable" with years in words, a duties-only posting, and labels inside one paragraph.
- Unit tests for the fallback, the duties fallback, ignored company text, the experience patterns, the seniority rules and the JSON format.

## Limits

- Alternatives count as all required: "Python or Go" gives both. Recruiters should remove what is optional.
- A sentence that mixes both ("Python required, Go preferred") is nice-to-have as a whole.
- Lowercase phrases in lists ("event sourcing") are only kept if the normalizer knows them; capitalized phrases are kept even when they are not skills ("Lambda", "English").
- English only. Headings in other languages are not recognized, so such texts fall back to "all required".
- Skills mentioned only under duties are ignored when the requirements already name skills.
