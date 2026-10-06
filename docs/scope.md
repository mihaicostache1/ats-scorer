# ATS project: scope, personas and user stories

**Status:** draft for the backlog session · **Owner:** ML/DevOps lead · **Covers:** weeks 3-6
**Related:** [Privacy and ethics checklist](privacy-ethics-checklist.md)

## 1. Summary

An applicant tracking system (ATS) where a hiring team posts jobs, adds candidates with PDF CVs, and sees the candidates of each job ranked by fit, with an explanation for every score.

**The system ranks and explains. People decide.** No score ever rejects, hides or contacts a candidate on its own.

## 2. Goals and non-goals

### Goals (by the end of week 6)

- A recruiter can go from "new job" to "ranked, explained shortlist" without developer help.
- Every score shows what drove it and which model version produced it.
- Every rejection is made by a person, with a reason, and is logged.
- A candidate's data can be exported and permanently deleted.

### Non-goals

- Automatic rejection, or hiding candidates below a score threshold (never)
- Billing, payments, subscription plans (dropped)
- Scraping job boards or sourcing candidates from the web
- Candidate-facing portal, email or calendar integration
- LLMs, video or voice analysis, emotion or personality inference
- Learned ranker, fairness dashboard, audit-log screen, drag-and-drop board: weeks 7-8 or later (the data they need is collected from week 5)

## 3. Personas

These are fictional. If you can talk to one or two real recruiters, replace the guesses below with what you learn.

### Maya, recruiter (role: `recruiter`)

In-house recruiter at a 60-person software company. Runs 5-8 open roles at a time, with 100+ applications each.

- **Goals:** build a shortlist fast, understand why each candidate ranks where they do, keep records tidy.
- **Frustrations:** reading hundreds of CVs, tools that rank without explanation, fixing badly parsed CVs, worrying about discriminating by accident.
- **Uses:** jobs, candidates, CV upload and review, ranked list, stages and decisions.
- **Success looks like:** a shortlist of about 10 in under an hour (hypothesis to test).

### Daniel, hiring manager (role: `viewer`)

Engineering manager who needs to hire two developers. Has little time and does not want to learn a new tool.

- **Goals:** see a short list with clear reasons, compare a few candidates, trust that the process is fair.
- **Frustrations:** being sent 40 CVs, not knowing why someone was picked.
- **Uses:** read-only view of shortlisted candidates and score explanations.

### Priya, admin (role: `admin`)

Operations lead who also administers the company's tools and is the practical owner of data protection.

- **Goals:** control who has access, answer data requests, make sure data is deleted on time, show that the process was fair.
- **Frustrations:** not knowing where candidate data lives, manual deletion, no record of who did what.
- **Uses:** users and roles, delete, export and retention settings (audit-log screen comes later).

## 4. Roles and permissions

| Action | Admin | Recruiter | Viewer (hiring manager) |
|---|---|---|---|
| Manage users and roles | Yes | No | No |
| Create and edit jobs | Yes | Yes | No |
| Add candidates, upload and correct CVs | Yes | Yes | No |
| See ranked list and score explanations | Yes | Yes | Shortlisted candidates only |
| Move stages, reject | Yes | Yes | No |
| Delete or export a candidate, set retention | Yes | No | No |
| Read the audit log (API now, screen later) | Yes | No | No |

"Shortlisted candidates only" for viewers is a data-minimisation proposal: hiring managers do not need to see every applicant. Confirm it in the session.

## 5. User stories

**Priority:** Must / Should / Could (MoSCoW). **Points** are a first guess for the estimation round. Tickets refer to IDs from the week 1-4 plan; stories marked "new" need tickets written for weeks 5-6.

| ID | Story | Persona | Epic | Priority | Week | Pts | Tickets |
|---|---|---|---|---|---|---|---|
| US-01 | Create, edit and close a job | Recruiter | Jobs and candidates | Must | 3 | 3 | B-9, F-8 |
| US-02 | Add a candidate with a basis record | Recruiter | Jobs and candidates | Must | 3 | 3 | B-10, F-9 |
| US-03 | Add a candidate to a job | Recruiter | Jobs and candidates | Must | 3 | 2 | B-10 |
| US-04 | Upload a CV and follow its processing | Recruiter | CV intake | Must | 3-4 | 5 | B-11, B-12, F-10 |
| US-05 | Review and correct a parsed CV | Recruiter | CV intake | Must | 4 | 5 | L-10, B-13, B-14, F-11 |
| US-06 | Score on qualifications only | Recruiter | Ranking | Must | 4 | 3 | L-14, new |
| US-07 | Invite users and assign roles | Admin | Admin and privacy | Should | 4 | 3 | B-15, F-12 |
| US-08 | See candidates ranked for a job | Recruiter | Ranking | Must | 5 | 8 | L-13, new |
| US-09 | Understand a score | Recruiter, hiring manager | Ranking | Must | 5 | 5 | L-13, new |
| US-10 | Move an application between stages | Recruiter | Decisions | Must | 5 | 3 | B-10, new |
| US-11 | Filter and sort the ranked list | Recruiter | Ranking | Should | 6 | 3 | new |
| US-12 | Scores refresh when a job changes | Recruiter | Ranking | Should | 6 | 3 | new |
| US-13 | Read-only shortlist for the hiring manager | Hiring manager | Decisions | Should | 6 | 2 | new |
| US-14 | Compare shortlisted candidates side by side | Hiring manager | Decisions | Could | 6 | 3 | new |
| US-15 | Find similar candidates | Recruiter | Ranking | Could | 6 | 3 | new |
| US-16 | Possible-duplicate warning | Recruiter | Jobs and candidates | Could | 5 | 2 | B-16 |
| US-17 | Delete a candidate permanently | Admin | Admin and privacy | Must | 5 | 3 | new |
| US-18 | Export all data held on a candidate | Admin | Admin and privacy | Should | 6 | 2 | new |
| US-19 | Set retention and review expiring candidates | Admin | Admin and privacy | Should | 6 | 3 | new |

**Totals:** 64 points. Must = 40 (about 60%), Should = 16, Could = 8. Re-estimate in the session and calibrate your real pace after the first sprint. If the Musts do not fit, cut Coulds first, then Shoulds.

### Stories in detail

#### US-01 Create, edit and close a job
As a **recruiter**, I want to create and edit a job with its description and required and nice-to-have skills, so that candidates are scored against what the role really needs.
- A job has a title, description, status (draft, open, closed), required skills and nice-to-have skills.
- Closing a job keeps its applications visible but blocks new ones.
- Create, edit and close actions appear in the audit log.

#### US-02 Add a candidate with a basis record
As a **recruiter**, I want to add a candidate and record how their data was obtained and on what basis, so that we only keep data we are allowed to keep.
- Name and email are required, plus the basis (applied directly, consented to talent pool, other) and its date.
- The version of the candidate notice they saw is stored (`notice_version`).
- The candidate list is searchable and paginated, and a profile shows applications and CVs.

#### US-03 Add a candidate to a job
As a **recruiter**, I want to attach a candidate to one or more jobs, so that each application has its own stage and score.
- A new application starts in the stage "Applied". The same candidate cannot be added twice to one job.
- A candidate profile lists all of their applications.
- Creating an application is audit-logged.

#### US-04 Upload a CV and follow its processing
As a **recruiter**, I want to upload a PDF CV and see its processing status, so that I know when the profile is ready or needs attention.
- Only PDFs up to 10 MB are accepted. Anything else is rejected with a clear message.
- Status goes queued, extracting, then parsed, needs review or failed, with a retry after a failure.
- Scanned PDFs go through OCR, and a corrupt file fails without crashing the worker.
- Only users of the same organization can download the file.

#### US-05 Review and correct a parsed CV
As a **recruiter**, I want to check the extracted profile next to the original PDF and fix mistakes, so that scoring uses accurate data.
- The PDF and an editable form are shown side by side, with low-confidence fields highlighted.
- The parser's original output and the corrected version are both stored, with who changed it and when.
- Corrections are validated against the schema, and viewers see the screen read-only.

#### US-06 Score on qualifications only
As a **recruiter**, I want scores to ignore names, photos, addresses, birth dates and similar details, so that a score does not reflect who the candidate is.
- The scorer's input never contains name, contact details, street address, photo, date of birth, graduation years or gendered titles.
- A test shows identical scores when only name or gender-coded details change.
- The limits are documented: education and hobbies can still correlate with protected traits.

#### US-07 Invite users and assign roles
As an **admin**, I want to invite colleagues and choose their role, so that people only get the access they need.
- Invite links are single-use and expire. Roles are admin, recruiter and viewer.
- An admin can change a role or deactivate a user. The last admin cannot be removed.
- Role changes and deactivations are audit-logged.

#### US-08 See candidates ranked for a job
As a **recruiter**, I want a job's candidates ordered by match score, so that I know whom to review first.
- The list shows score (0-100), band (strong, moderate, weak), parse status and current stage, with pagination.
- Candidates whose CV failed or needs review appear in a separate "Needs manual review" group. They are never ranked at the bottom with a zero.
- The list is labelled advisory. Nothing is hidden or rejected automatically, and every candidate is reachable.
- Ranking 1,000 candidates for one job finishes within a time limit agreed in the session.

#### US-09 Understand a score
As a **recruiter or hiring manager**, I want to see why a candidate got their score, so that I can judge whether it is right.
- The detail view shows the component breakdown (skills, semantic similarity, experience, title), matched and missing skills, and the model version.
- Each matched skill shows the phrase found in the CV.
- A short note explains that the score is advisory and can be wrong.

#### US-10 Move an application between stages
As a **recruiter**, I want to change an application's stage, so that everyone can see where each candidate is.
- Stages: Applied, Shortlisted, Interview, Offer, Hired, Rejected. Each row has a stage dropdown, and stage tabs show counts. A drag-and-drop board is an optional later extra.
- Each move stores who, when, from and to. Moving to Rejected requires a reason from a fixed list plus an optional note.
- The score and model version shown at the time of the decision are stored with the event.
- Viewers cannot change stages.

#### US-11 Filter and sort the ranked list
As a **recruiter**, I want to filter and sort the ranked list, so that I can find the right people in a long list.
- Filters: stage, minimum score, required skill present, years of experience. Sort by score or date.
- Filters live in the URL, and the page shows "showing X of Y".
- Filtering never changes a score.

#### US-12 Scores refresh when a job changes
As a **recruiter**, I want scores to update after I edit a job's requirements, so that the ranking never shows stale numbers.
- Editing required skills or description triggers rescoring in the background.
- The list shows when scores were last computed and a "rescoring" state while it runs.
- Old scores are kept with their model version for the audit trail.

#### US-13 Read-only shortlist for the hiring manager
As a **hiring manager**, I want to open a job and see only its shortlisted candidates with their score explanations, so that I can review them without learning the whole tool.
- A viewer sees shortlisted and later-stage candidates only, never the full applicant list.
- No write actions are visible or possible.
- The page works on a phone-sized screen.

#### US-14 Compare shortlisted candidates side by side
As a **hiring manager**, I want to compare two or three candidates side by side, so that I can discuss them in an interview debrief.
- Compare shows skills, experience and the score breakdown in aligned rows.
- Redacted details stay hidden in the comparison.

#### US-15 Find similar candidates
As a **recruiter**, I want to find candidates similar to a chosen one, so that I can build a pool for a second role.
- Results come from embedding similarity within the same organization.
- Each result shows why it is similar (shared skills).

#### US-16 Possible-duplicate warning
As a **recruiter**, I want a warning when a new candidate looks like an existing one, so that I do not keep two records for the same person.
- Matches on normalized email or phone, and fuzzy name matching, are shown as "possible duplicate".
- Candidates are never merged automatically.

#### US-17 Delete a candidate permanently
As an **admin**, I want to delete a candidate and everything held about them, so that I can honour erasure requests.
- Deletion removes the candidate row, applications, CV files, parsed data, embeddings and scores.
- The audit log keeps only a pseudonymous ID and the fact of deletion, never CV content.
- An automated test verifies that nothing remains in the database, vector column or file storage.
- A confirmation step names the candidate and states that the action cannot be undone.

#### US-18 Export all data held on a candidate
As an **admin**, I want to export everything held about a candidate in a readable format, so that I can answer access requests.
- The export contains profile, parsed data, applications, stage history, scores with explanations and decision reasons.
- The export is audit-logged and restricted to admins.

#### US-19 Set retention and review expiring candidates
As an **admin**, I want to set how long candidate data is kept and see who is about to expire, so that nothing is held longer than intended.
- Retention is configurable per organization, with a proposed default of 6 months after the process closes.
- A list shows candidates due for deletion in the next 30 days, with a bulk delete or extend (with a new basis).
- Nothing is deleted without an admin action in the first release.

## 6. Release plan

| Week | Demo at the end of the week | Stories |
|---|---|---|
| 3 | Create a job, add a candidate, upload a CV and watch its status | US-01, 02, 03, start of 04 |
| 4 | Review and correct a parsed CV, invite a user, scoring ignores identifying details (milestone M2) | US-04, 05, 06, 07 |
| 5 | A ranked, explained list for a job, stage changes with reasons, delete a candidate | US-08, 09, 10, 16, 17 |
| 6 | Filters, rescoring, hiring-manager view, export and retention (milestone M3) | US-11, 12, 13, 18, 19, then Coulds 14, 15 |

**Later (weeks 7-8):** learned ranker experiment, bias-audit dashboard, audit-log screen, hardening, optional drag-and-drop board.

## 7. Jira setup

- **Epics:** Jobs and candidates (US-01, 02, 03, 16), CV intake (US-04, 05), Ranking (US-06, 08, 09, 11, 12, 15), Decisions (US-10, 13, 14), Admin and privacy (US-07, 17, 18, 19).
- **Fields:** issue type Story, story points, priority from MoSCoW (Must = Highest, Should = High, Could = Low), components `api`, `web`, `ml`.
- **Links:** each story links to the implementing tickets from the week plan. Create the weeks 5-6 tickets after the session.
- **Definition of ready:** the story has a persona, testable acceptance criteria, an estimate of 5 points or less (split anything bigger), and known dependencies.
- **Definition of done:** reviewed PR, green CI, OpenAPI and docs updated, acceptance criteria demonstrated, privacy checklist items touched by the story ticked.

## 8. Backlog prioritization session (1 hour)

| Time | Activity |
|---|---|
| 0:00-0:05 | Recap goals, non-goals and personas (lead) |
| 0:05-0:15 | Read through the stories and clarify questions, no estimating yet |
| 0:15-0:30 | Prioritize with MoSCoW. Rules: every Must traces to a persona goal, and Musts fit within about 60% of capacity |
| 0:30-0:45 | Estimate with planning poker (1, 2, 3, 5, 8). Anything above 5 gets split. Mark dependencies |
| 0:45-0:55 | Decide the open questions below and write the answers into this document |
| 0:55-1:00 | Assign week 3 stories, confirm the week 3 demo goal |

**Output:** an ordered Jira backlog, answered open questions, and a week 3 sprint ready to start.

## 9. Open questions for the session

1. **Target market:** EU, New York City, both, or somewhere else? This sets the candidate notice text and the audit approach.
2. **Retention default:** proposal is 6 months after the process closes. Confirm against local guidance.
3. **Viewer scope:** shortlisted candidates only, as proposed?
4. **Rejection reasons:** who approves the fixed list, and does it avoid anything tied to personal characteristics?
5. **Score display:** number plus band (proposed), or band only?
6. **Real data:** will the system ever see real candidate CVs? Proposal: no, synthetic or explicitly consented data only.

## 10. Risks

| Risk | Mitigation |
|---|---|
| CV parsing is less accurate on real layouts than on synthetic ones | Test early on messy samples, keep the correction screen, flag low confidence |
| The lead carries ML, DevOps and product work | Keep backlog grooming to 1 hour a week and move small tasks to teammates |
| Scoring quality is hard to prove with a small evaluation set | State the limits openly, grow the rated set each sprint |
| Scope creep from Could stories | Only start a Could when every Must for the week is done |
| Misreading the legal rules | Treat the checklist as engineering guidance and get a professional review before any real use |
| Personas are guesses | Interview at least one real recruiter in weeks 3-4 |
