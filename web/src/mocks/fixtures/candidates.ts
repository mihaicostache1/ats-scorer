import type { components } from "@/api/generated/schema";
import { MOCK_ORG_ID, MOCK_USER_ID } from "./auth";

type CandidateResponse = components["schemas"]["CandidateResponse"];

interface ParsedInput {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  headline: string;
  summary: string;
  skills: string[];
  years: number;
  experiences: { title: string; company: string; start: string; end: string | null }[];
  education: { degree: string; institution: string; grad_year: number }[];
  languages?: { language: string; level: string }[];
  certifications?: string[];
}

/** Builds `parsed_data` in parsed-CV schema 1.0 (docs/ml/parsed-cv-schema.md). */
function parsedV1(i: ParsedInput): Record<string, unknown> {
  return {
    schema_version: "1.0",
    source: "parser",
    contact: {
      name: i.name,
      email: i.email,
      phone: i.phone,
      location: i.location,
      links: [],
    },
    headline: i.headline,
    summary: i.summary,
    skills: i.skills.map((raw) => ({ raw, normalized: raw })),
    experience_years: i.years,
    experiences: i.experiences.map((e) => ({
      ...e,
      is_current: e.end === null,
      summary: null,
      bullets: [],
    })),
    education: i.education,
    languages: i.languages ?? [],
    certifications: i.certifications ?? [],
    confidence: {},
  };
}

/** Twenty more synthetic candidates so the list has several pages to search and page through. */
function generatedCandidates(): CandidateResponse[] {
  const first = ["Maya", "Liam", "Noor", "Mateo", "Aiko", "Omar", "Sofia", "Kofi", "Elena", "Raj"];
  const last = ["Hughes", "Petrov", "Haddad", "Silva", "Tanaka"];
  const places = ["Berlin, Germany", "Toronto, Canada", "Lisbon, Portugal", null, "Austin, TX"];
  const skillSets = [
    ["Java", "Spring Boot", "Kafka"],
    ["Go", "gRPC", "Kubernetes"],
    ["React", "TypeScript", "GraphQL"],
    ["Python", "Pandas", "SQL"],
  ];
  return Array.from({ length: 20 }, (_, n) => {
    const name = `${first[n % first.length]} ${last[(n * 3) % last.length]}`;
    const email = `${name.toLowerCase().replace(" ", ".")}${n}@example.com`;
    const location = places[n % places.length];
    const phone = n % 4 === 3 ? null : `+1-555-01${String(n).padStart(2, "0")}`;
    const created = new Date(Date.UTC(2026, 8, 30 - n, 10, 0)).toISOString();
    return {
      id: `c0000000-0000-4000-8000-0000000000${String(n + 1).padStart(2, "0")}`,
      org_id: MOCK_ORG_ID,
      full_name: name,
      email,
      phone,
      location,
      cv_file_path: null,
      consent_given_at: n % 5 === 4 ? null : created,
      created_at: created,
      updated_at: created,
      // Every third candidate has not been parsed yet.
      parsed_data:
        n % 3 === 2
          ? {}
          : parsedV1({
              name,
              email,
              phone,
              location,
              headline: "Software Engineer",
              summary: "Engineer with a track record of shipping reliable services.",
              skills: skillSets[n % skillSets.length],
              years: 2 + (n % 7),
              experiences: [
                { title: "Software Engineer", company: "Example Co.", start: "2021-06", end: null },
              ],
              education: [
                {
                  degree: "B.Sc. Computer Science",
                  institution: "State University",
                  grad_year: 2020,
                },
              ],
            }),
    };
  });
}

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
    parsed_data: parsedV1({
      name: "Alex Mercer",
      email: "alex.mercer@example.com",
      phone: "+1-555-0199",
      location: "San Francisco, CA",
      headline: "Backend Software Engineer",
      summary: "Backend engineer focused on Python APIs and data-heavy services.",
      skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "Git", "Docker"],
      years: 5.5,
      experiences: [
        {
          title: "Backend Software Engineer",
          company: "TechCorp Inc.",
          start: "2022-05",
          end: null,
        },
        { title: "Junior Developer", company: "StartupXYZ", start: "2020-04", end: "2022-04" },
      ],
      education: [{ degree: "B.S. Computer Science", institution: "UC Berkeley", grad_year: 2020 }],
      languages: [{ language: "English", level: "native" }],
      certifications: ["AWS Certified Developer"],
    }),
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
    parsed_data: parsedV1({
      name: "Priya Nair",
      email: "priya.nair@example.com",
      phone: "+44-7700-900123",
      location: "London, UK",
      headline: "Senior Frontend Engineer",
      summary: "Frontend engineer with a design-systems background.",
      skills: ["TypeScript", "React", "Next.js", "Tailwind CSS", "Playwright", "Figma"],
      years: 7,
      experiences: [
        {
          title: "Senior Frontend Engineer",
          company: "FinTech Global",
          start: "2022-01",
          end: null,
        },
        { title: "UI Developer", company: "Agency Ltd.", start: "2019-01", end: "2021-12" },
      ],
      education: [
        {
          degree: "M.Sc. Human-Computer Interaction",
          institution: "University College London",
          grad_year: 2018,
        },
      ],
      languages: [
        { language: "English", level: "fluent" },
        { language: "Hindi", level: "native" },
      ],
    }),
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
    parsed_data: {}, // not parsed yet
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
    parsed_data: parsedV1({
      name: "Jordan Kim",
      email: "jordan.kim@example.com",
      phone: "+82-10-9876-5432",
      location: "Seoul, South Korea",
      headline: "Data Engineer",
      summary: "Builds batch and streaming pipelines for e-commerce analytics.",
      skills: ["Apache Kafka", "dbt", "Spark", "Python", "Iceberg", "Airflow"],
      years: 4.5,
      experiences: [
        { title: "Data Engineer", company: "E-Commerce Giant", start: "2022-03", end: null },
      ],
      education: [{ degree: "B.Sc. Data Science", institution: "KAIST", grad_year: 2021 }],
    }),
  },
  ...generatedCandidates(),
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

/** CV documents in every processing state: parsed, needs review, extracted and failed. */
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
    page_count: 2,
    ocr_used: false,
    error_code: null,
    error_message: null,
    attempts: 1,
    processed_at: "2026-10-01T09:16:10Z",
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
    page_count: 1,
    ocr_used: false,
    error_code: null,
    error_message: null,
    attempts: 1,
    processed_at: "2026-10-02T11:41:05Z",
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
    page_count: 6,
    ocr_used: true,
    error_code: null,
    error_message: null,
    attempts: 1,
    processed_at: "2026-10-03T15:07:30Z",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-10-03T15:05:00Z",
    updated_at: "2026-10-03T15:07:30Z",
  },
  {
    // An older upload for Alex; the newer one above supersedes it.
    id: "7c9e6679-7425-40de-944b-e07fc1f90aea",
    org_id: MOCK_ORG_ID,
    candidate_id: mockCandidates[0].id,
    original_filename: "alex-mercer-2025.pdf",
    content_type: "application/pdf",
    size_bytes: 40120,
    sha256: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
    status: "parsed",
    page_count: 2,
    ocr_used: false,
    error_code: null,
    error_message: null,
    attempts: 1,
    processed_at: "2026-03-12T08:01:00Z",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-03-12T08:00:00Z",
    updated_at: "2026-03-12T08:01:00Z",
  },
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90aeb",
    org_id: MOCK_ORG_ID,
    candidate_id: mockCandidates[5].id,
    original_filename: "scan-no-text.pdf",
    content_type: "application/pdf",
    size_bytes: 310452,
    sha256: "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9",
    status: "failed",
    page_count: 3,
    ocr_used: true,
    error_code: "no_text_found",
    error_message: "We could not find any readable text in this PDF. Try uploading a clearer copy.",
    attempts: 3,
    processed_at: "2026-10-04T12:03:00Z",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-10-04T12:00:00Z",
    updated_at: "2026-10-04T12:03:00Z",
  },
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90aec",
    org_id: MOCK_ORG_ID,
    candidate_id: mockCandidates[6].id,
    original_filename: "extracted-only.pdf",
    content_type: "application/pdf",
    size_bytes: 55820,
    sha256: "b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c",
    status: "extracted",
    page_count: 1,
    ocr_used: false,
    error_code: null,
    error_message: null,
    attempts: 1,
    processed_at: "2026-10-05T09:01:00Z",
    uploaded_by: MOCK_USER_ID,
    created_at: "2026-10-05T09:00:00Z",
    updated_at: "2026-10-05T09:01:00Z",
  },
];
