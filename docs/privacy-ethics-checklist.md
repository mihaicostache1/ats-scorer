# Privacy and ethics checklist

**Engineering guidance, not legal advice.** Owner: ML/DevOps lead · Last reviewed: 2026-10-06 · Review at every sprint review and before any real-data use.
Drafted with AI assistance from public sources and not independently verified. Check each rule against the official text. See [scope](scope.md) for the stories referenced below (US-xx).

> **Core principle: the system ranks and explains. People decide.** No score ever rejects, hides or contacts a candidate by itself.

**Scope note.** While the project uses only synthetic or consented data, most legal duties below do not attach to you. They attach once a real employer uses the tool on real candidates. We build as if they already did.

## Checklist

### 1. Consent and lawful basis
- [ ] Each candidate record stores how the data was obtained, on what basis, when, and which notice version the candidate saw (US-02)
- [ ] A template candidate notice exists in `/docs`: an automated tool helps rank applications, what it looks at, how to ask for human-only review, who to contact
- [ ] Only data needed to assess fit for the role is stored. No social media scraping or enrichment
- [ ] Keeping candidates in a talent pool beyond the process needs separate consent that can be withdrawn

### 2. No protected attributes
- [ ] Scorer input excludes name, contact, address, photo, date of birth, graduation years and gendered titles, and a test proves it (US-06)
- [ ] Special categories (health, ethnicity, religion, union membership, sexual orientation, political views) are never extracted or stored from CVs
- [ ] No inference of protected traits (gender from a name, age from dates) and no emotion, personality, video or voice analysis
- [ ] Demographic data for fairness audits is voluntary, stored apart from candidate records, and never reachable by the scorer

### 3. Humans decide
- [ ] Scores are labelled advisory and every score is explained (US-09)
- [ ] No auto-reject, auto-hide or threshold that removes candidates. The full list is always reachable (US-08)
- [ ] Failed or low-confidence parses go to "needs manual review", never to the bottom of the ranking (US-08)
- [ ] Every rejection has a human actor and a reason, and stores the score and model version shown at the time (US-10)
- [ ] Review is meaningful, not a rubber stamp: reviewers can see the evidence and disagree with one click

### 4. Retention and deletion
- [ ] Retention is set per organization. Proposed default: delete or anonymize 6 months after the process closes, confirmed against local rules (US-19)
- [ ] Deletion removes the candidate row, CV files, parsed data, embeddings, scores and cached copies. Audit events keep only an ID (US-17)
- [ ] Backup and log expiry is documented, and logs never contain CV text
- [ ] Deletion is tested end to end, including the vector column and file storage

### 5. Candidate rights
- [ ] Access and export (US-18), correction (US-05) and erasure (US-17) are possible
- [ ] A candidate can ask for a human-only assessment, and the procedure is written down
- [ ] A named person answers requests within the legal deadline (one month under GDPR)

### 6. Fairness and accountability
- [ ] Every score stores the model version and component breakdown
- [ ] Selection-rate ratios by group are checked on synthetic or consented test data before each scorer release (weeks 7-8)
- [ ] The learned ranker ships only if it beats the baseline and passes the same checks. Recruiter decisions can contain human bias, so they are not ground truth
- [ ] Known limits are written in `/docs/ml` (small synthetic data, proxies such as university or hobbies)
- [ ] A short risk assessment (DPIA-style) is written before real-data use

### 7. Security
- [ ] CV files are private, permission-checked and never served from a public path. Organization isolation is tested
- [ ] TLS on staging and production, secrets outside the repo, encryption at rest on database and file storage
- [ ] Only synthetic or consented data in the repo, CI and screenshots. No real CVs sent to third-party services
- [ ] Dependency alerts are enabled

## Rules to check for your target market

Confirm the target market in the backlog session. Dates and details change, so verify each row.

| Rule | What it means for this project |
|---|---|
| **EU AI Act** (Regulation 2024/1689) | AI used to recruit or select people, including filtering applications and evaluating candidates, is classed as high-risk (Annex III). Duties include risk management, data governance, documentation, logging, human oversight and transparency, split between the builder (provider) and the employer (deployer). The date these duties apply was set for August 2026, but a postponement has been proposed, so check the current date |
| **GDPR** (EU, UK equivalent) | Data minimisation and storage limitation (Art. 5), a lawful basis (Art. 6), special categories (Art. 9), notices (Art. 13-14), access, correction and erasure (Art. 15-17), limits on decisions based solely on automated processing (Art. 22), impact assessments for risky processing (Art. 35). A human who rubber-stamps does not count as human involvement |
| **NYC Local Law 144** (in force since July 2023) | An employer using an automated employment decision tool to screen candidates for New York City jobs needs an independent bias audit within the previous year, a public summary of the results, and notice to candidates at least 10 business days before use, including how to request an alternative process. Audits report impact ratios by sex and race or ethnicity, including intersections. The law sets no pass mark. The four-fifths rule from US employment guidance is a common yardstick |
| **Other places to check** | Illinois (AI in employment decisions, effective January 2026), Colorado (high-risk AI law, effective date has been postponed), California (rules on automated decision systems in employment, from October 2025) |

*Reviewed by: ________________ Date: ____________*
