import type { components } from "@/api/generated/schema";
import { MOCK_ORG_ID, MOCK_USER_ID } from "./auth";
import { mockJobs, mockPipelineStages } from "./jobs";
import { mockCandidates } from "./candidates";
import scoreExplanations from "./score-explanations.json";

type ApplicationResponse = components["schemas"]["ApplicationResponse"];
type ScoreResponse = components["schemas"]["ScoreResponse"];

/** In-memory mutable list — POST /applications appends here during a session. */
export const mockApplications: ApplicationResponse[] = [
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[0].id,
    candidate_id: mockCandidates[0].id,
    stage_id: mockPipelineStages[1].id, // Shortlisted
    status: "active",
    rejection_reason: null,
    applied_at: "2026-10-05T09:00:00Z",
    updated_at: "2026-10-05T09:00:00Z",
  },
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5d",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[0].id,
    candidate_id: mockCandidates[2].id,
    stage_id: mockPipelineStages[2].id, // Interview
    status: "active",
    rejection_reason: null,
    applied_at: "2026-10-04T14:30:00Z",
    updated_at: "2026-10-04T14:30:00Z",
  },
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5e",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[1].id,
    candidate_id: mockCandidates[1].id,
    stage_id: mockPipelineStages[0].id, // Applied
    status: "active",
    rejection_reason: null,
    applied_at: "2026-10-06T10:00:00Z",
    updated_at: "2026-10-06T10:00:00Z",
  },
  {
    // Alex applied to a second job.
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b5f",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[2].id,
    candidate_id: mockCandidates[0].id,
    stage_id: mockPipelineStages[0].id, // Applied
    status: "active",
    rejection_reason: null,
    applied_at: "2026-10-08T08:30:00Z",
    updated_at: "2026-10-08T08:30:00Z",
  },
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b60",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[0].id,
    candidate_id: mockCandidates[5].id,
    stage_id: mockPipelineStages[5].id, // Rejected
    status: "rejected",
    rejection_reason: "Missing required backend experience.",
    applied_at: "2026-10-03T13:00:00Z",
    updated_at: "2026-10-04T09:00:00Z",
  },
  {
    id: "b892a1c3-4d5e-6f7a-8b9c-0d1e2f3a4b61",
    org_id: MOCK_ORG_ID,
    job_id: mockJobs[1].id,
    candidate_id: mockCandidates[6].id,
    stage_id: mockPipelineStages[4].id, // Hired
    status: "hired",
    rejection_reason: null,
    applied_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-10-02T16:00:00Z",
  },
];

/** Saved explanations for the demo application and its own job. */
export const mockScorerVersion = Object.values(scoreExplanations)[0].model_version;
export const mockScores: Record<string, ScoreResponse> = Object.fromEntries(
  Object.entries(scoreExplanations).map(([id, data], index) => {
    const explanation = data as components["schemas"]["ScoreExplanation"];
    const application = mockApplications.find((entry) => entry.id === id)!;
    const outcome: ScoreResponse = {
      id: `d90123e4-f5a6-7b8c-9d0e-1f2a3b4c5d6${index}`,
      application_id: application.id,
      status: explanation.model_version === mockScorerVersion ? "scored" : "rescoring",
      score: explanation.total,
      band: explanation.band,
      model_version: explanation.model_version,
      computed_at: application.applied_at,
      explanation,
    };
    return [application.id, outcome];
  })
);

type StageHistoryResponse = components["schemas"]["StageHistoryResponse"];

/** Stage history per application id, oldest first; the first entry is the initial placement. */
export const mockStageHistory: Record<string, StageHistoryResponse[]> = {
  [mockApplications[0].id]: [
    {
      id: "e1000000-0000-4000-8000-000000000001",
      application_id: mockApplications[0].id,
      from_stage_id: null,
      to_stage_id: mockPipelineStages[0].id,
      reason: null,
      overall_score: null,
      model_version: null,
      moved_by: MOCK_USER_ID,
      moved_at: "2026-10-05T09:00:00Z",
    },
    {
      id: "e1000000-0000-4000-8000-000000000002",
      application_id: mockApplications[0].id,
      from_stage_id: mockPipelineStages[0].id,
      to_stage_id: mockPipelineStages[1].id,
      reason: "Strong match on required skills.",
      overall_score: null,
      model_version: null,
      moved_by: MOCK_USER_ID,
      moved_at: "2026-10-05T11:20:00Z",
    },
  ],
  [mockApplications[1].id]: [
    {
      id: "e1000000-0000-4000-8000-000000000003",
      application_id: mockApplications[1].id,
      from_stage_id: null,
      to_stage_id: mockPipelineStages[0].id,
      reason: null,
      overall_score: null,
      model_version: null,
      moved_by: MOCK_USER_ID,
      moved_at: "2026-10-04T14:30:00Z",
    },
    {
      id: "e1000000-0000-4000-8000-000000000004",
      application_id: mockApplications[1].id,
      from_stage_id: mockPipelineStages[0].id,
      to_stage_id: mockPipelineStages[2].id,
      reason: null,
      overall_score: null,
      model_version: null,
      moved_by: MOCK_USER_ID,
      moved_at: "2026-10-04T16:45:00Z",
    },
  ],
  [mockApplications[2].id]: [
    {
      id: "e1000000-0000-4000-8000-000000000005",
      application_id: mockApplications[2].id,
      from_stage_id: null,
      to_stage_id: mockPipelineStages[0].id,
      reason: null,
      overall_score: null,
      model_version: null,
      moved_by: MOCK_USER_ID,
      moved_at: "2026-10-06T10:00:00Z",
    },
  ],
};
