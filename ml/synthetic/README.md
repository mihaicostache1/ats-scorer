# Synthetic CV and job dataset

`generate.py` builds a test dataset for the CV parser and the ranking model: about 100 CVs (a PDF plus the ground-truth JSON for each), about 20 job descriptions, and a blank sheet for human ratings. Everything is invented, so it can be committed to tests, shown in demos and shared without privacy concerns.

## Generate it

Needs Python 3.11 or newer.

```bash
cd ml/synthetic
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python generate.py
```

| Option | Default | Meaning |
|---|---|---|
| `--seed` | 42 | Random seed. The same seed gives the same dataset |
| `--cvs` | 100 | Number of CVs |
| `--jobs` | 20 | Number of job descriptions |
| `--pairs-per-job` | 15 | Candidates to rate for each job |
| `--year` | 2026 | Year treated as "now" for work-history dates |
| `--out` | `output` | Output folder (git-ignored) |

## What you get

```
output/
  manifest.json            seed, package versions, file list, SHA-256 of every PDF
  ratings_template.csv     the candidate/job pairs to rate, rating column empty
  cvs/C001.pdf             the CV as a recruiter would receive it
  cvs/C001.json            ground truth for that CV
  jobs/J01.json            one job description
```

The dataset covers 10 role families (backend, frontend, data science, DevOps, QA, mobile, data analyst, product, UX design, marketing) at four seniority levels (junior, mid, senior, lead).

### CV ground truth (`cvs/C001.json`)

| Field | Content |
|---|---|
| `candidate_id` | `C001`, `C002`, ... |
| `full_name`, `email`, `phone`, `location` | Contact details printed in the PDF |
| `headline`, `summary`, `languages`, `certifications` | Other text printed in the PDF |
| `role_family`, `seniority` | What the CV was generated as. Not printed in the PDF |
| `layout` | `classic`, `two_column`, `table` or `plain` |
| `parsed_data` | What a perfect parser would return, in the same shape as `candidates.parsed_data` in the API: `skills`, `experience_years`, `education` (`degree`, `institution`, `grad_year`) and `work_history` (`title`, `company`, `years`, `summary`). Each job also carries `start`, `end` (`null` means current) and `bullets` |
| `sensitive_noise` | `null`, or a date of birth and nationality that are printed in the PDF. See below |

### Job description (`jobs/J01.json`)

Uses the field names of `POST /api/v1/jobs`: `title`, `department`, `location`, `employment_type`, `description`, `required_skills`, `preferred_skills`, `min_experience_years`. It also has `job_id`, `role_family` and `seniority`. Descriptions come in three writing styles (sections, prose, terse).

## Layouts

Layouts are assigned in a fixed cycle, so a default run has 43 classic, 29 two-column, 14 table and 14 plain CVs.

| Layout | What makes it hard to parse |
|---|---|
| `classic` | Nothing. Single column, clear headings |
| `two_column` | Shaded sidebar (contact, skills, education) next to the main column. The sidebar is sometimes on the right, and is always written to the PDF first, so text order in the file does not match reading order |
| `table` | Dates sit in a separate table column from the job they belong to. Skills are a three-column grid |
| `plain` | Typewriter font, no bold headings, bullets run together into one paragraph, contact details at the bottom |

All layouts also vary heading names ("Experience", "Employment History", ...), date formats (`2021`, `Mar 2021`, `03/2021`), fonts, bullet characters and section order.

About 15% of CVs print a date of birth and nationality, as some real CVs do. These are listed under `sensitive_noise` so tests can check that the parser does not extract them and the scorer never sees them (user story US-06).

## Human ratings

A rating says how well one candidate fits one job. The file is a CSV with exactly these columns:

```csv
candidate_id,job_id,rating
C001,J01,2
C007,J01,0
```

| Rating | Meaning | Rule of thumb |
|---|---|---|
| 3 | Strong fit | Has nearly all required skills and at least the required experience. You would shortlist |
| 2 | Good fit | Has most required skills. One gap in skills or experience that an interview could clear up |
| 1 | Weak fit | Related background, but several required skills are missing or the seniority is clearly wrong |
| 0 | No fit | A different field, or almost none of the requirements |

How to rate:

1. Copy `output/ratings_template.csv` to `ratings/<your-name>.csv` (this folder is committed).
2. For each row, open the job's JSON and the candidate's **PDF** (not the JSON, which gives away the answer) and fill in a whole number from 0 to 3.
3. Rate on qualifications only. Ignore the name, location, date of birth, nationality and how nice the layout looks.
4. Rate every row and do not add rows. Two people should rate each pair independently, so that agreement can be measured.

The template lists 15 candidates per job (300 pairs with the defaults). About two thirds come from the job's own role family, so the ratings spread over the whole scale instead of being mostly zeros.

Ratings belong to one dataset version. Record the `seed` and `generator_version` from `manifest.json` next to your ratings, and re-rate if either changes.

## Reproducibility

- The same seed, arguments and package versions produce the same files. Check it by running twice and comparing the two `manifest.json` files, which contain a SHA-256 hash of every PDF.
- `requirements.txt` pins exact versions on purpose. A different Faker version can produce different names for the same seed. Skills, jobs and dates do not depend on Faker.
- Each CV has its own random stream, so CV number 17 is the same whether you generate 20 CVs or 200.
- If you change the templates or logic in `generate.py`, bump `GENERATOR_VERSION`.

## No real personal data

- Names are random combinations from Faker's name lists. A match with a real person is a coincidence.
- Email addresses use `example.com`, `example.org` and `example.net`, which are reserved and cannot receive mail.
- Phone numbers use the `555-01xx` range, which is reserved for fiction.
- Companies and universities are invented. Cities are real, but no street addresses are generated.
- Every JSON file has `"synthetic": true`, and every PDF says "Synthetic test data. Not a real person." in its document properties.

## Limits

- Real CVs are messier than these: scans, photos, multi-page tables, other languages. Good results here are a lower bar, not proof that the parser works on real documents.
- All text is English.
- The CVs contain no demographic information beyond the optional noise fields, so this dataset cannot be used for a bias audit by itself.
