# Redaction before scoring (L-14)

**Status:** implemented in `model_version` `hybrid-1.1.0`. Owner: ML/DevOps lead. User story: US-06 (score on qualifications only).

| What | Where |
|---|---|
| Code | [ml/ats_scoring/redaction.py](../../ml/ats_scoring/redaction.py) |
| Tests | [ml/tests/test_redaction.py](../../ml/tests/test_redaction.py), and `test_identity_details_in_the_text_are_not_embedded` in [test_embeddings.py](../../ml/tests/test_embeddings.py) |
| Checklist item | [privacy-ethics-checklist.md](../privacy-ethics-checklist.md), section 2 |

## In one paragraph

`redact(parsed_cv)` returns a copy of a parsed CV without the details that say who the candidate is or stand in for a protected trait: name, contact details, street address, photo references, date of birth and age, graduation years and other dates, gendered honorifics, job words and pronouns. It keeps the qualifications, plus a coarse location (city or region and country) for location fit. Total years of experience are computed from the position dates before the dates are dropped. `score()` and `Embedder.embed_candidates()` call `redact()` themselves, so a caller cannot forget it. **Redaction reduces proxy bias. It does not remove it**: school and employer names, hobbies, languages and wording can still correlate with gender, age or origin (see [Limits](#limits)).

## Use

```python
from ats_scoring import redact, score

redacted = redact(parsed_data)            # a new dict, the input is not changed
result = score(parsed_data, job)          # score() redacts on its own as well
```

- `redact()` reads schema 1.x (`experiences`) and the draft 0.1 (`work_history`, skills as strings) and returns the same shape. A record that is valid under the [parsed-CV schema](parsed-cv-schema.md) stays valid.
- Redacting twice gives the same result, so redacting before storing and again in `score()` is safe.
- `as_of=` sets the date a current position runs to when years of experience are computed. The default is today. Pass it in tests.
- **Backend:** store the full parsed record as now (recruiters need the contact details). Pass it to `score()` and `Embedder` unchanged, because both redact. Re-embed CVs embedded before this change (see [Rollout](#rollout)).

## What is removed and what is kept

The record is rebuilt from an allow-list. A field that is not listed below, such as `photo`, `date_of_birth`, `gender` or `nationality`, is dropped without being read.

| Field | Result |
|---|---|
| `contact.name`, `.email`, `.phone`, `.links` | Removed |
| `contact.location` | Keeps the last two parts that hold no street word, number or postcode. "Str. Lipscani 12, Bucharest, Romania" becomes "Bucharest, Romania"; "12 Baker Street, London, NW1 6XE, United Kingdom" becomes "London, United Kingdom" |
| `experience_years` | Kept. When missing, computed from the position dates first (same rule as the CV parser, B-13: overlapping positions count once, and a position without usable dates gives no total) |
| `experiences[].start`, `.end` | Removed, after `experience_years` is computed. `is_current` is kept |
| `education[].grad_year` | Removed |
| `confidence` | Removed. It points into fields that no longer exist, and the scorer does not read it |
| `headline`, `summary`, position titles, summaries and bullets, `education[].degree`, `certifications` | Scrubbed (see below) |
| `skills` | Identity details only (name, email, links, phone, image files). Years stay, so "SQL Server 2019" is unchanged |
| `experiences[].company`, `education[].institution`, `languages`, `schema_version`, `source` | Kept as they are. The scorer reads none of them |

### Free-text scrubbing

Applied to the scrubbed fields above, in this order:

1. **Honorifics** before a name: Mr, Mrs, Ms, Mx, Miss, Mister, Madam, Madame, Mme, Mlle. Case-sensitive, so "never miss a deadline" and "MS SQL" are not touched.
2. **Contact details:** any email address, URL (and `linkedin.com/...`, `github.com/...`), phone number (at least 9 digits, starting with `+`, `0` or `(`, or written like 415-555-0100), and image file names (`maria.jpg`).
3. **The candidate's own details** wherever they appear: full name and each part of it, email, phone, links, and the street parts of the location.
4. **Photo references:** "photo attached", "Photo: ...", "[photo]", "headshot".
5. **Personal labels and the rest of their sentence:** "Gender: ...", "Date of birth: ...", "DOB", "Marital status", "Nationality", "Citizenship", "Religion", "Place of birth", "Age: ...", "Born in/on ...". Also ages: "aged 34", "34 years old".
6. **Dates:** full dates, month and year, ranges ("2015 - 2019", "March 2021 - present"), and years from 1950 to 2100, with the word that introduces them ("class of", "graduated in", "since", "from", "in").
7. **Gendered words** become neutral ones, keeping capitals: chairman/chairwoman to chairperson, salesman/saleswoman to salesperson, waiter/waitress to server, actress to actor, maternity/paternity to parental, and others. Pronouns become they/them/their ("her" always becomes "their").

A field that matches nothing is returned exactly as written. Only changed text is tidied (empty brackets, doubled punctuation and spaces). The grammar of a changed sentence can be off ("They was"), because only the scorer reads it.

## Tests

- **No redacted value is left:** a valid 1.0 record with identity details in every place a parser could put them (contact, summary, bullets, titles, degree, certifications, extra fields) is redacted, and none of the values appear anywhere in the result.
- **No redacted value reaches the scorer:** every function `score()` uses to read the candidate (`candidate_text`, `skill_texts`, `match_skills`, `experience_fit`, `match_title`) is wrapped, and none of the values appear in any argument it receives, or in the result.
- **Only the name changes, identical score:** two candidates who differ only in name (in the contact block, the email, the summary and a bullet) give the same redacted record and the same score. The same holds for gender-coded details: Ms/Mr, she/he, her/his, Saleswoman/Salesman.
- **Not embedded:** the text sent to the embedding model holds none of the details.
- Location, experience computation, idempotence, schema validity, the draft shape, and text that must stay unchanged ("50 ms", "MS SQL", ".NET", "Photography", "never miss a deadline").

## Effect on scores and speed

- **Evaluation (L-9 set):** unchanged. The 22 CVs have no identity details in the fields the scorer reads, so their text and embeddings stay the same. Spearman 0.739, per-job Spearman 0.809, NDCG@10 0.985: [2026-11-10_hybrid-1.1.0.json](../../ml/evaluation/results/2026-11-10_hybrid-1.1.0.json).
- **`model_version`** goes from `hybrid-1.0.0` to `hybrid-1.1.0`, because the same input can now get a different score: a CV that mentions a date, a pronoun or the candidate's name in its text.
- **Speed:** redaction adds about 0.25 ms per candidate. Ranking 1,000 candidates takes 0.75-0.82 s instead of about 0.5 s (see [hybrid-scorer.md](hybrid-scorer.md#speed)).

## Rollout

- Embeddings made before `hybrid-1.1.0` were built from unredacted text. Re-embed stored CVs once when this version is deployed.
- Scores stored with `hybrid-1.0.0` keep that version. Compare scores only within one version.

## Limits

Redaction is rule-based (regular expressions and an allow-list), not a model. It lowers the chance that the scorer sees who the candidate is. It does not make the scorer blind to protected traits.

- **Proxies stay in the qualifications.** School and university names, employers, degrees, languages, volunteering, hobbies and clubs ("women in tech", a sports team, a religious charity) can correlate with gender, age, ethnicity, religion or origin. Removing them would remove real qualifications, so they stay. School and employer names are not read by the scorer, but they can shape the summary and bullets, which are.
- **Experience tracks age.** `experience_years` is kept on purpose. The scorer only checks that a minimum is met, so more years never lower a score.
- **Location is kept at city or region level.** A city can still correlate with origin. A postcode or district is dropped.
- **Only the listed patterns are caught.** Another person's name (a referee), a name the parser did not put in `contact.name`, non-English labels ("Data nașterii", "Geschlecht"), and gendered words not on the list stay. The lists are English-first.
- **Some ordinary words are hit.** A name part that is also a skill ("Julia", "Swift") is removed from that candidate's free text (but not from the skill list). Numbers from 1950 to 2100 are read as years ("served 2000 customers" loses "2000"). "Waiter" becomes "server".
- **Only the CV is redacted.** Job titles and descriptions are not, so a job titled "Saleswoman" is compared with "Salesperson". Every candidate is redacted the same way, so this lowers the title fit for everyone equally instead of favouring one group.
- **Dates in skills stay** ("SQL Server 2019"), because they name versions.
- **No test can prove the absence of bias.** The selection-rate check in the [privacy checklist](../privacy-ethics-checklist.md) (section 6) is still needed before each scorer release.
