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
Creates a new job posting with ESCO required and preferred skills.

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
  "status": "open",
  "description": "We are looking for a Senior Backend Engineer...",
  "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "preferred_skills": ["Redis", "PyTorch", "Fairlearn"],
  "min_experience_years": 4,
  "created_at": "2026-10-01T08:00:00Z"
}
```

#### `GET /api/v1/jobs/{id}/stages`
Retrieves ordered pipeline stages for a job.

**Response (`200 OK`)**:
```json
[
  {
    "id": "stage-01-applied",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "Applied",
    "stage_order": 1,
    "stage_type": "applied"
  },
  {
    "id": "stage-02-screening",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "AI Screening & Review",
    "stage_order": 2,
    "stage_type": "screening"
  },
  {
    "id": "stage-03-interview",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "Technical Interview",
    "stage_order": 3,
    "stage_type": "interview"
  },
  {
    "id": "stage-04-offer",
    "org_id": "123e4567-e89b-12d3-a456-426614174000",
    "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "Offer Extended",
    "stage_order": 4,
    "stage_type": "offer"
  }
]
```

---

### 2.3 Candidates & CV Upload

#### `POST /api/v1/candidates/upload`
Uploads a PDF resume file. Performs automatic PyMuPDF text parsing with Tesseract OCR fallback, extracting skills and work history.

**Request Header**: `Content-Type: multipart/form-data`  
**Request Payload**: `file` (binary PDF file), `full_name` (optional), `email` (optional).

**Response (`201 Created`)**:
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "full_name": "Alex Mercer",
  "email": "alex.mercer@example.com",
  "phone": "+1-555-0199",
  "location": "San Francisco, CA",
  "cv_file_path": "uploads/123e4567/cv_f47ac10b.pdf",
  "ocr_used": false,
  "parsed_data": {
    "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Git", "Docker"],
    "experience_years": 5.5,
    "education": [
      {
        "degree": "B.S. Computer Science",
        "institution": "UC Berkeley",
        "grad_year": 2019
      }
    ],
    "work_history": [
      {
        "title": "Backend Software Engineer",
        "company": "TechCorp Inc.",
        "years": 3.5,
        "summary": "Built high-throughput FastAPI web services and managed PostgreSQL databases."
      },
      {
        "title": "Junior Software Engineer",
        "company": "DataFlow Soft",
        "years": 2.0,
        "summary": "Developed Python ETL scripts and REST APIs."
      }
    ]
  },
  "created_at": "2026-10-01T09:15:00Z"
}
```

#### `PATCH /api/v1/candidates/{id}`
Screen to review and manually edit/correct parsed candidate skills and profile data.

**Request Body**:
```json
{
  "full_name": "Alexander Mercer",
  "parsed_data": {
    "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Git", "Docker", "PyTorch"]
  }
}
```

**Response (`200 OK`)**:
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "full_name": "Alexander Mercer",
  "email": "alex.mercer@example.com",
  "parsed_data": {
    "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Git", "Docker", "PyTorch"]
  }
}
```

#### `DELETE /api/v1/candidates/{id}`
GDPR Right to Erasure hard delete.

**Response (`204 No Content`)**

---

### 2.4 Applications & Drag-and-Drop Pipeline

#### `PATCH /api/v1/applications/{id}/stage`
Updates application pipeline stage (drag-and-drop on KanBan board). Logged to audit logs for candidate ranker training dataset.

**Request Body**:
```json
{
  "stage_id": "stage-03-interview",
  "rejection_reason": null
}
```

**Response (`200 OK`)**:
```json
{
  "id": "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "job_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "candidate_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "stage_id": "stage-03-interview",
  "status": "active",
  "updated_at": "2026-10-01T09:17:21Z"
}
```

#### `GET /api/v1/applications/{id}/score`
Retrieves candidate hybrid ranking score breakdown and explanations.

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
