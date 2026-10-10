import type { components } from "@/api/generated/schema";
import { MOCK_ORG_ID } from "./auth";
import { mockJobs, mockPipelineStages } from "./jobs";
import { mockCandidates } from "./candidates";

type ApplicationResponse = components["schemas"]["ApplicationResponse"];
type ScoreResponse = components["schemas"]["ScoreResponse"];

/** In-memory mutable list — POST /applications appends here during a session. */
export const mockApplications: ApplicationResponse[] = [
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[0].id,
    candidate_id: mockCandidates[0].id,
    stage_id: mockPipelineStages[1].id, // Screening
    status: "active",
    applied_at: "2026-10-05T09:00:00Z",
  },
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5d",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[0].id,
    candidate_id: mockCandidates[2].id,
    stage_id: mockPipelineStages[2].id, // Technical Interview
    status: "active",
    applied_at: "2026-10-04T14:30:00Z",
  },
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5e",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[1].id,
    candidate_id: mockCandidates[1].id,
    stage_id: mockPipelineStages[0].id, // Applied
    status: "active",
    applied_at: "2026-10-06T10:00:00Z",
  },
];

/** Pre-computed scores keyed by applicationId. */
export const mockScores: Record<string, ScoreResponse> = {
  "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c": {
    id: "d90123e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
    application_id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    overall_score: 87.5,
    skill_overlap_score: 90.0,
    semantic_score: 85.0,
    experience_score: 92.0,
    title_fit_score: 80.0,
    model_version: "v1.0.0-baseline-cpu",
    component_breakdown: {
      matched_skills: ["Python", "FastAPI", "PostgreSQL", "Docker"],
      missing_skills: [],
      weights: { skill_overlap: 0.4, semantic: 0.3, experience: 0.2, title_fit: 0.1 } as unknown as Record<string, never>,
      explanations: [
        "Candidate matched 4 of 4 required skills (100%).",
        "Vector semantic similarity cosine distance is 0.85.",
        "Candidate has 5.5 years experience (exceeds requirement of 4 years).",
        "Job title 'Backend Software Engineer' is a strong match for 'Senior Python Backend Engineer'.",
      ],
    },
  },
  "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5d": {
    id: "d90123e4-f5a6-7b8c-9d0e-1f2a3b4c5d6f",
    application_id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5d",
    overall_score: 78.2,
    skill_overlap_score: 75.0,
    semantic_score: 82.0,
    experience_score: 88.0,
    title_fit_score: 60.0,
    model_version: "v1.0.0-baseline-cpu",
    component_breakdown: {
      matched_skills: ["Python", "PyTorch", "scikit-learn"],
      missing_skills: ["FastAPI", "Docker"],
      weights: { skill_overlap: 0.4, semantic: 0.3, experience: 0.2, title_fit: 0.1 } as unknown as Record<string, never>,
      explanations: [
        "Candidate matched 3 of 4 required skills (75%).",
        "Vector semantic similarity cosine distance is 0.82.",
        "Candidate has 6.0 years experience (exceeds requirement of 4 years).",
        "Title 'ML Research Scientist' is a weak match for 'Senior Python Backend Engineer'.",
      ],
    },
  },
  "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5e": {
    id: "d90123e4-f5a6-7b8c-9d0e-1f2a3b4c5d70",
    application_id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5e",
    overall_score: 94.1,
    skill_overlap_score: 100.0,
    semantic_score: 91.0,
    experience_score: 95.0,
    title_fit_score: 88.0,
    model_version: "v1.0.0-baseline-cpu",
    component_breakdown: {
      matched_skills: ["TypeScript", "React", "Next.js", "Tailwind CSS"],
      missing_skills: [],
      weights: { skill_overlap: 0.4, semantic: 0.3, experience: 0.2, title_fit: 0.1 } as unknown as Record<string, never>,
      explanations: [
        "Candidate matched 4 of 4 required skills (100%).",
        "Vector semantic similarity cosine distance is 0.91.",
        "Candidate has 7.0 years experience (exceeds requirement of 6 years).",
        "Title 'Senior Frontend Engineer' is a strong match for 'Principal Frontend Architect'.",
      ],
    },
  },
};
