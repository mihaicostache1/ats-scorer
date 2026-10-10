import { http, HttpResponse } from "msw";
import { mockApplications, mockScores } from "../fixtures/applications";
import { MOCK_ORG_ID } from "../fixtures/auth";
import { mockPipelineStages } from "../fixtures/jobs";
import type { components } from "@/api/generated/schema";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type ApplicationResponse = components["schemas"]["ApplicationResponse"];

/** In-memory store — mutations persist for the browser session. */
let applicationsStore: ApplicationResponse[] = [...mockApplications];
const scoresStore: Record<string, components["schemas"]["ScoreResponse"]> = { ...mockScores };

function notFound(resource: string, id: unknown): Response {
  return HttpResponse.json(
    {
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: `${resource} with ID '${id}' was not found.`,
        timestamp: new Date().toISOString(),
        request_id: `req_${Date.now()}`,
      },
    } satisfies components["schemas"]["ErrorEnvelope"],
    { status: 404 }
  );
}

export const applicationHandlers = [
  /**
   * POST /applications
   * Links a candidate to a job; returns a new ApplicationResponse and
   * synthesises a score record.
   */
  http.post(`${BASE}/applications`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["CreateApplicationRequest"];

    const newApp: ApplicationResponse = {
      id: crypto.randomUUID(),
      org_id: MOCK_ORG_ID,
      job_id: body.job_id,
      candidate_id: body.candidate_id,
      stage_id: mockPipelineStages[0].id, // starts at first stage
      status: "active",
      applied_at: new Date().toISOString(),
    };
    applicationsStore = [newApp, ...applicationsStore];

    // Auto-generate a placeholder score for the new application.
    scoresStore[newApp.id] = {
      id: crypto.randomUUID(),
      application_id: newApp.id,
      overall_score: Math.round(Math.random() * 30 + 60), // 60–90
      skill_overlap_score: Math.round(Math.random() * 30 + 60),
      semantic_score: Math.round(Math.random() * 30 + 60),
      experience_score: Math.round(Math.random() * 30 + 60),
      title_fit_score: Math.round(Math.random() * 30 + 60),
      model_version: "v1.0.0-baseline-cpu",
      component_breakdown: {
        matched_skills: [],
        missing_skills: [],
        explanations: ["Score computed by mock handler."],
      },
    };

    return HttpResponse.json(newApp, { status: 201 });
  }),

  /**
   * PATCH /applications/:id/stage — move pipeline stage (drag-and-drop).
   */
  http.patch(`${BASE}/applications/:id/stage`, async ({ params, request }) => {
    const idx = applicationsStore.findIndex((a) => a.id === params.id);
    if (idx === -1) return notFound("Application", params.id);

    const body = (await request.json()) as components["schemas"]["UpdateStageRequest"];
    applicationsStore[idx] = { ...applicationsStore[idx], stage_id: body.stage_id };
    return HttpResponse.json(applicationsStore[idx]);
  }),

  /**
   * GET /applications/:id/score — retrieve AI hybrid score breakdown.
   */
  http.get(`${BASE}/applications/:id/score`, ({ params }) => {
    const score = scoresStore[params.id as string];
    if (!score) return notFound("Score for application", params.id);
    return HttpResponse.json(score);
  }),
];
