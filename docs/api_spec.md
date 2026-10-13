# REST API Contract & Mock Payload Specifications

## Executive Overview & API Contract Policy
This document establishes the frozen REST API specification for the AI-assisted Applicant Tracking System (ATS). It defines the contract between the FastAPI backend and Next.js frontend (F-4), enabling parallel frontend development using realistic mock data.

### API Contract Freeze Policy
- **Draft Status**: Ready for review by frontend and lead.
- **Freeze Deadline**: End of Week 1.
- **Change Management**: Any breaking schema changes or additions requested after the Week 1 freeze MUST be submitted via a Pull Request explicitly tagging the `@frontend-lead` and `@lead-dev`.

---

## 1. Shared API Conventions

### 1.1 Identifier Format (IDs)
All resource identifiers across the API are **UUID v4** strings formatted according to RFC 4122.
- *Example*: `123e4567-e89b-12d3-a456-426614174000`

### 1.2 Authentication Header
All authenticated requests must supply a Bearer JWT in the HTTP Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
The JWT payload includes:
- `sub`: User ID (`UUID`)
- `org_id`: Organization Tenant ID (`UUID`)
- `role`: Role string (`admin` | `recruiter` | `viewer`)

### 1.3 Standard Error Format (RFC 7807 Compliant Envelope)
All non-2xx API error responses return a uniform JSON error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The candidate email format is invalid.",
    "details": [
      {
        "field": "email",
        "issue": "Must be a valid email address."
      }
    ],
    "timestamp": "2026-10-01T09:17:21Z",
    "request_id": "req_8f92a1b4"
  }
}
```

#### Standard Error Codes
- `UNAUTHORIZED` (401): Missing or expired JWT token.
- `FORBIDDEN` (403): User role lacks required permission (e.g. `viewer` trying to delete candidate).
- `RESOURCE_NOT_FOUND` (404): Target entity does not exist in workspace.
- `VALIDATION_ERROR` (422): Input field failed format/type validation.
- `CONFLICT` (409): Duplicate email or duplicate candidate application for job.
- `INTERNAL_SERVER_ERROR` (500): Unexpected system error.

### 1.4 Standard Pagination Envelope
All paginated list endpoints return an `items` list and a `pagination` metadata block:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total_items": 42,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## 2. API Endpoints & Realistic Mock Responses

### 2.1 Auth & User Management

#### `POST /api/v1/auth/login`
Authenticates recruiter or admin credentials.

**Request Body**:
```json
{
  "email": "recruiter@acme.com",
  "password": "SecretPassword123!"
}
```

**Response (`200 OK`)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YjFkZWI0ZC0zYjdkLTRiYWQtOWJkZC0yYjBkN2IzZGNiNmQiLCJvcmdfaWQiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJyb2xlIjoicmVjcnVpdGVyIn0.signature",
  "token_type": "Bearer",
  "user": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "recruiter@acme.com",
    "full_name": "Sarah Jenkins",
    "role": "recruiter"
  }
}
```

---

### 2.2 Jobs & Pipeline Stages

#### `POST /api/v1/jobs`
Creates a new job posting with ESCO required and preferred skills. The job starts as `draft`. Requires the `admin` or `recruiter` role; only `title` and `description` are required.

**Request Body**:
```json
{
  "title": "Senior Backend Engineer",
  "department": "Engineering",
  "location": "Remote (US/EU)",
  "employment_type": "full_time",
  "description": "We are looking for a Senior Backend Engineer proficient in Python, FastAPI, PostgreSQL, and microservices architecture.",
  "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "preferred_skills": ["Redis", "PyTorch", "Fairlearn"],
  "min_experience_years": 4
}
```

**Response (`201 Created`)**:
```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Senior Backend Engineer",
  "department": "Engineering",
  "location": "Remote (US/EU)",
  "employment_type": "full_time",
  "status": "draft",
  "description": "We are looking for a Senior Backend Engineer...",
  "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "preferred_skills": ["Redis", "PyTorch", "Fairlearn"],
  "min_experience_years": 4,
  "created_at": "2026-10-01T08:00:00Z",
  "updated_at": "2026-10-01T08:00:00Z"
}
```

#### `GET /api/v1/jobs`
Lists the organization's job postings in the standard pagination envelope. Any role can read.

| Query param | Values | Default |
| --- | --- | --- |
| `status` | `draft`, `open`, `paused`, `closed`, `archived` | all except `archived` |
| `search` | case-insensitive substring of title, department or location | none |
| `page` | integer, 1 or more | `1` |
| `per_page` | integer, 1 to 100 | `20` |
| `sort_by` | `created_at`, `updated_at`, `title`, `status` | `created_at` |
| `sort_order` | `asc`, `desc` | `desc` |

Archived jobs are only returned when `status=archived` is requested.

#### `GET /api/v1/jobs/{id}`
Returns one job posting. Any role can read. A job in another organization returns `404`.

#### `PATCH /api/v1/jobs/{id}`
Partially updates a job posting; fields left out are unchanged. `department` and `location` can be cleared with `null`. Status is not editable here. Requires the `admin` or `recruiter` role.

**Request Body**:
```json
{
  "title": "Staff Backend Engineer",
  "location": null
}
```

#### `PATCH /api/v1/jobs/{id}/status`
Moves a job posting to `draft`, `open` or `closed`. Requires the `admin` or `recruiter` role.

**Request Body**:
```json
{
  "status": "open"
}
```

#### `POST /api/v1/jobs/{id}/archive`
Sets the job's status to `archived`, which hides it from the default list. No request body; repeating the call is harmless. Requires the `admin` or `recruiter` role.

The update, status and archive endpoints all return the full job (`200 OK`), and every successful write is recorded as an audit event (`create_job`, `update_job`, `change_job_status`, `archive_job`).

#### `GET /api/v1/jobs/{id}/stages`
Returns the job's pipeline stages in order. Any role can read. Every organization is seeded with six default stages (`job_id` is `null`); a job uses them unless it has stages of its own.

**Response (`200 OK`)** (first two of the six defaults shown; the rest are `Interview`/`interview`, `Offer`/`offer`, `Hired`/`hired`, `Rejected`/`rejected`):
```json
[
  {
    "id": "c1d2e3f4-a5b6-4c8d-9e0f-1a2b3c4d5e6f",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "job_id": null,
    "name": "Applied",
    "stage_order": 1,
    "stage_type": "applied"
  },
  {
    "id": "d2e3f4a5-b6c7-4d8e-9f0a-2b3c4d5e6f7a",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "job_id": null,
    "name": "Shortlisted",
    "stage_order": 2,
    "stage_type": "screening"
  }
]
```

---

### 2.3 Candidates & CV Upload

#### `POST /api/v1/candidates`
Adds a candidate to the organization. Requires the `admin` or `recruiter` role; only `full_name` and `email` are required. `consent_given_at` is the time the candidate consented to data processing and stays `null` until consent is recorded; it must include a timezone. Emails are stored lowercase and are unique per organization (`409` on a duplicate).

**Request Body**:
```json
{
  "full_name": "Alex Mercer",
  "email": "alex.mercer@example.com",
  "phone": "+1-555-0199",
  "location": "San Francisco, CA",
  "consent_given_at": "2026-10-01T09:00:00Z"
}
```

**Response (`201 Created`)**:
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "full_name": "Alex Mercer",
  "email": "alex.mercer@example.com",
  "phone": "+1-555-0199",
  "location": "San Francisco, CA",
  "cv_file_path": null,
  "parsed_data": {},
  "consent_given_at": "2026-10-01T09:00:00Z",
  "created_at": "2026-10-01T09:15:00Z",
  "updated_at": "2026-10-01T09:15:00Z"
}
```

#### `GET /api/v1/candidates`
Lists the organization's candidates in the standard pagination envelope. Any role can read.

| Query param | Values | Default |
| --- | --- | --- |
| `search` | case-insensitive substring of name or email | none |
| `page` | integer, 1 or more | `1` |
| `per_page` | integer, 1 to 100 | `20` |
| `sort_by` | `created_at`, `updated_at`, `full_name`, `email` | `created_at` |
| `sort_order` | `asc`, `desc` | `desc` |

#### `GET /api/v1/candidates/{id}`
Returns one candidate. Any role can read. A candidate in another organization returns `404`.

#### `POST /api/v1/candidates/{id}/cv`
Uploads a PDF CV for an existing candidate and queues it for processing. Requires the `admin` or `recruiter` role. A candidate can have several CVs.

**Request Header**: `Content-Type: multipart/form-data`
**Request Payload**: `file` (binary PDF file).

The file is checked by its content, not its extension or declared type, and may be at most 10 MB.

| Status | When |
| --- | --- |
| `201` | Stored; the document's `status` is `queued` |
| `404` | The candidate is not in the organization |
| `413` | The file is larger than 10 MB |
| `415` | The content is not a PDF |

**Response (`201 Created`)**:
```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "candidate_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "original_filename": "alex-mercer.pdf",
  "content_type": "application/pdf",
  "size_bytes": 48211,
  "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "status": "queued",
  "uploaded_by": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "created_at": "2026-10-01T09:15:00Z",
  "updated_at": "2026-10-01T09:15:00Z"
}
```

`status` is one of `queued`, `extracting`, `parsed`, `needs_review`, `failed`. Where the file is stored is never returned.

#### `GET /api/v1/candidates/{id}/cv`
Lists the candidate's CV documents, newest first. Any role can read.

#### `GET /api/v1/candidates/{id}/cv/{cv_id}`
Returns one CV document; poll it to follow the processing `status`. Any role can read.

#### `GET /api/v1/candidates/{id}/cv/{cv_id}/download`
Returns the PDF (`Content-Type: application/pdf`, sent as an attachment). Any role in the organization that owns the candidate can download; everyone else gets `404`. This endpoint is the only way to read a CV file: files are not served from any public path. Uploads and downloads are recorded as audit events (`upload_cv`, `download_cv`).

#### `PATCH /api/v1/candidates/{id}`
Partially updates a candidate's `full_name`, `email`, `phone`, `location` or `consent_given_at`; fields left out are unchanged. `phone`, `location` and `consent_given_at` can be cleared with `null`. Requires the `admin` or `recruiter` role. Returns the full candidate (`200 OK`).

**Request Body**:
```json
{
  "full_name": "Alexander Mercer",
  "consent_given_at": "2026-10-02T10:00:00Z"
}
```

#### `DELETE /api/v1/candidates/{id}`
Permanently deletes the candidate together with their applications, stage history, scores and stored CV files. Requires the `admin` role.

**Response (`204 No Content`)**

Candidate writes are recorded as audit events (`create_candidate`, `update_candidate`, `delete_candidate`). Their details never contain personal data, because the audit log outlives a deleted candidate.

---

### 2.4 Applications & Pipeline Stages

#### `POST /api/v1/applications`
Links a candidate to a job. The application starts in the job's first stage (`Applied`). Requires the `admin` or `recruiter` role. Returns `404` if the job or candidate is not in the organization and `409` if the candidate already applied to this job or the job is `closed` or `archived`.

**Request Body**:
```json
{
  "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "candidate_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response (`201 Created`)**:
```json
{
  "id": "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "candidate_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "stage_id": "c1d2e3f4-a5b6-4c8d-9e0f-1a2b3c4d5e6f",
  "status": "active",
  "rejection_reason": null,
  "applied_at": "2026-10-01T09:16:00Z",
  "updated_at": "2026-10-01T09:16:00Z"
}
```

#### `GET /api/v1/applications`
Lists applications, newest first, in the standard pagination envelope. Any role can read. Optional filters: `job_id`, `candidate_id`, `stage_id`, `status` (`active`, `hired`, `rejected`, `withdrawn`), plus `page` and `per_page`.

#### `GET /api/v1/applications/{id}`
Returns one application. Any role can read.

#### `PATCH /api/v1/applications/{id}/stage`
Moves an application to another stage of its job's pipeline. Requires the `admin` or `recruiter` role. `reason` is optional and is stored with the move. `status` follows the type of the new stage: `hired`, `rejected` (the reason is also copied to `rejection_reason`), otherwise `active`. Moving to the stage the application is already in changes nothing. A stage that does not belong to the job's pipeline returns `404`.

**Request Body**:
```json
{
  "stage_id": "e3f4a5b6-c7d8-4e9f-8a1b-3c4d5e6f7a8b",
  "reason": "Strong take-home exercise"
}
```

**Response (`200 OK`)**: the full application, as above, with the new `stage_id`.

#### `GET /api/v1/applications/{id}/history`
Returns every stage the application entered, oldest first. Any role can read. The first entry is the initial placement and has `from_stage_id: null`.

**Response (`200 OK`)**:
```json
[
  {
    "id": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "application_id": "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "from_stage_id": null,
    "to_stage_id": "c1d2e3f4-a5b6-4c8d-9e0f-1a2b3c4d5e6f",
    "reason": null,
    "overall_score": null,
    "model_version": null,
    "moved_by": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "moved_at": "2026-10-01T09:16:00Z"
  },
  {
    "id": "1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e",
    "application_id": "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "from_stage_id": "c1d2e3f4-a5b6-4c8d-9e0f-1a2b3c4d5e6f",
    "to_stage_id": "e3f4a5b6-c7d8-4e9f-8a1b-3c4d5e6f7a8b",
    "reason": "Strong take-home exercise",
    "overall_score": 88.5,
    "model_version": "tfidf-skills-0.1.0",
    "moved_by": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "moved_at": "2026-10-01T09:17:21Z"
  }
]
```

Each entry keeps the application's latest `overall_score` and `model_version` at the time of the move (both `null` if it had no score), so a later re-score does not change what a decision was based on.

Creating an application and every stage move are recorded as audit events (`create_application`, `move_application_stage`). The move event carries the job and the from/to stage IDs and names; the free-text reason is kept only in the stage history.

#### `GET /api/v1/applications/{id}/score`
Retrieves candidate hybrid ranking score breakdown and explanations. `skill_overlap_score`, `experience_score` and `title_fit_score` are `null` when the scoring model does not compute them; `null` never means a score of 0.

**Response (`200 OK`)**:
```json
{
  "id": "d90123e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
  "application_id": "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "overall_score": 88.50,
  "skill_overlap_score": 90.00,
  "semantic_score": 85.50,
  "experience_score": 92.00,
  "title_fit_score": 84.00,
  "model_version": "v1.0.0-baseline-cpu",
  "component_breakdown": {
    "matched_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
    "missing_skills": ["Redis"],
    "skill_match_percentage": 75.0,
    "weights": {
      "skill_overlap": 0.40,
      "semantic": 0.30,
      "experience": 0.20,
      "title_fit": 0.10
    },
    "score_explanations": [
      "Candidate possesses 4 out of 5 required skills for Senior Backend Engineer.",
      "Sentence transformer cosine vector similarity score is 0.855.",
      "Candidate has 5.5 years experience (exceeds min requirement of 4 years)."
    ]
  },
  "calculated_at": "2026-10-01T09:15:30Z"
}
```
