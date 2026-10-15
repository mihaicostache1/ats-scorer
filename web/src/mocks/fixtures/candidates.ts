import type { components } from "@/api/generated/schema";
import { MOCK_ORG_ID, MOCK_USER_ID } from "./auth";

type CandidateResponse = components["schemas"]["CandidateResponse"];

export const mockCandidates: CandidateResponse[] = [
  {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    org_id: MOCK_ORG_ID,
    full_name: "Alex Mercer",
    email: "alex.mercer@example.com",
    phone: "+1-555-0199",
    location: "San Francisco, CA",
    cv_file_path: null,
    consent_given_at: "2026-10-01T09:00:00Z",
    created_at: "2026-10-01T09:15:00Z",
    updated_at: "2026-10-01T09:15:00Z",
    parsed_data: {
      skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "Git", "Docker"],
      experience_years: 5.5,
      education: ["B.S. Computer Science, UC Berkeley"],
      work_history: [
        { title: "Backend Software Engineer", company: "TechCorp Inc.", years: 3.5 },
        { title: "Junior Developer", company: "StartupXYZ", years: 2.0 },
      ],
    },
  },
  {
    id: "a2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d",
    org_id: MOCK_ORG_ID,
    full_name: "Priya Nair",
    email: "priya.nair@example.com",
    phone: "+44-7700-900123",
    location: "London, UK",
    cv_file_path: null,
    consent_given_at: "2026-10-01T09:00:00Z",
    created_at: "2026-10-01T09:15:00Z",
    updated_at: "2026-10-01T09:15:00Z",
    parsed_data: {
      skills: ["TypeScript", "React", "Next.js", "Tailwind CSS", "Playwright", "Figma"],
      experience_years: 7.0,
      education: ["M.Sc. Human-Computer Interaction, University College London"],
      work_history: [
        { title: "Senior Frontend Engineer", company: "FinTech Global", years: 4.0 },
        { title: "UI Developer", company: "Agency Ltd.", years: 3.0 },
      ],
    },
  },
  {
    id: "b3c4d5e6-f7a8-9b0c-1d2e-3f4a5b6c7d8e",
    org_id: MOCK_ORG_ID,
    full_name: "Daniel Okonkwo",
    email: "d.okonkwo@example.com",
    phone: "+1-555-0247",
    location: "New York, NY",
    cv_file_path: null,
    consent_given_at: "2026-10-01T09:00:00Z",
    created_at: "2026-10-01T09:15:00Z",
    updated_at: "2026-10-01T09:15:00Z",
    parsed_data: {
      skills: ["Python", "PyTorch", "scikit-learn", "NLP", "Fairlearn", "MLflow"],
      experience_years: 6.0,
      education: [
        "Ph.D. Machine Learning, Carnegie Mellon University",
        "B.Sc. Mathematics, University of Lagos",
      ],
      work_history: [
        { title: "ML Research Scientist", company: "DeepVision AI", years: 3.0 },
        { title: "Research Engineer", company: "Academia CMU", years: 3.0 },
      ],
    },
  },
  {
    id: "c4d5e6f7-a8b9-0c1d-2e3f-4a5b6c7d8e9f",
    org_id: MOCK_ORG_ID,
    full_name: "Emilia Santos",
    email: "emilia.santos@example.com",
    phone: "+55-11-98765-4321",
    location: "São Paulo, Brazil",
    cv_file_path: null,
    consent_given_at: "2026-10-01T09:00:00Z",
    created_at: "2026-10-01T09:15:00Z",
    updated_at: "2026-10-01T09:15:00Z",
    parsed_data: {
      skills: ["Kubernetes", "Terraform", "AWS", "Docker", "Datadog", "ArgoCD"],
      experience_years: 8.0,
      education: ["B.Sc. Computer Engineering, USP"],
      work_history: [
        { title: "Principal DevOps Engineer", company: "CloudScale Inc.", years: 5.0 },
        { title: "Systems Administrator", company: "BankTech", years: 3.0 },
      ],
    },
  },
  {
    id: "d5e6f7a8-b9c0-1d2e-3f4a-5b6c7d8e9f0a",
    org_id: MOCK_ORG_ID,
    full_name: "Jordan Kim",
    email: "jordan.kim@example.com",
    phone: "+82-10-9876-5432",
    location: "Seoul, South Korea",
    cv_file_path: null,
    consent_given_at: "2026-10-01T09:00:00Z",
    created_at: "2026-10-01T09:15:00Z",
    updated_at: "2026-10-01T09:15:00Z",
    parsed_data: {
      skills: ["Apache Kafka", "dbt", "Spark", "Python", "Iceberg", "Airflow"],
      experience_years: 4.5,
      education: ["B.Sc. Data Science, KAIST"],
      work_history: [{ title: "Data Engineer", company: "E-Commerce Giant", years: 4.5 }],
    },
  },
];

export const mockPaginatedCandidates: components["schemas"]["PaginatedCandidatesResponse"] = {
  items: mockCandidates,
  pagination: {
    page: 1,
    per_page: 20,
    total_items: mockCandidates.length,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  },
};

type CvDocumentResponse = components["schemas"]["CvDocumentResponse"];

/** CV documents for the first three candidates, in the three most common processing states. */
export const mockCvDocuments: CvDocumentResponse[] = [
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    org_id: MOCK_ORG_ID,
    candidate_id: mockCandidates[0].id,
    original_filename: "alex-mercer.pdf",
    content_type: "application/pdf",
    size_bytes: 48211,
    sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    status: "parsed",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-10-01T09:15:00Z",
    updated_at: "2026-10-01T09:16:10Z",
  },
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae8",
    org_id: MOCK_ORG_ID,
    candidate_id: mockCandidates[1].id,
    original_filename: "priya-nair-cv.pdf",
    content_type: "application/pdf",
    size_bytes: 91734,
    sha256: "60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752",
    status: "parsed",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-10-02T11:40:00Z",
    updated_at: "2026-10-02T11:41:05Z",
  },
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae9",
    org_id: MOCK_ORG_ID,
    candidate_id: mockCandidates[2].id,
    original_filename: "okonkwo_scan.pdf",
    content_type: "application/pdf",
    size_bytes: 1204557,
    sha256: "fd61a03af4f77d870fc21e05e7e80678095c92d808cfb3b5c279ee04c74aac13",
    status: "needs_review",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-10-03T15:05:00Z",
    updated_at: "2026-10-03T15:07:30Z",
  },
];
