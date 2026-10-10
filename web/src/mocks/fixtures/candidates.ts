import type { components } from "@/api/generated/schema";
import { MOCK_ORG_ID } from "./auth";

type CandidateResponse = components["schemas"]["CandidateResponse"];

export const mockCandidates: CandidateResponse[] = [
  {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    org_id: MOCK_ORG_ID,
    full_name: "Alex Mercer",
    email: "alex.mercer@example.com",
    phone: "+1-555-0199",
    location: "San Francisco, CA",
    cv_file_path: "uploads/acme-corp/cv_f47ac10b.pdf",
    ocr_used: false,
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
    cv_file_path: "uploads/acme-corp/cv_a2b3c4d5.pdf",
    ocr_used: false,
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
    cv_file_path: "uploads/acme-corp/cv_b3c4d5e6.pdf",
    ocr_used: true,
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
    cv_file_path: "uploads/acme-corp/cv_c4d5e6f7.pdf",
    ocr_used: false,
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
    cv_file_path: "uploads/acme-corp/cv_d5e6f7a8.pdf",
    ocr_used: false,
    parsed_data: {
      skills: ["Apache Kafka", "dbt", "Spark", "Python", "Iceberg", "Airflow"],
      experience_years: 4.5,
      education: ["B.Sc. Data Science, KAIST"],
      work_history: [
        { title: "Data Engineer", company: "E-Commerce Giant", years: 4.5 },
      ],
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
