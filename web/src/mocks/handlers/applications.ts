import { http, HttpResponse } from "msw";
import { mockApplications, mockScores, mockStageHistory } from "../fixtures/applications";
import { MOCK_ORG_ID, MOCK_USER_ID } from "../fixtures/auth";
import { mockPipelineStages } from "../fixtures/jobs";
import type { components } from "@/api/generated/schema";
import { BASE, errorResponse, notFound, paginate } from "./utils";

type ApplicationResponse = components["schemas"]["ApplicationResponse"];
type StageHistoryResponse = components["schemas"]["StageHistoryResponse"];

/** In-memory stores — mutations persist for the browser session. */
let applicationsStore: ApplicationResponse[] = [...mockApplications];
const historyStore: Record<string, StageHistoryResponse[]> = structuredClone(mockStageHistory);
const scoresStore: Record<string, components["schemas"]["ScoreResponse"]> = { ...mockScores };

/** Application status follows the type of its current stage. */
function statusForStage(stageId: string): ApplicationResponse["status"] {
  const type = mockPipelineStages.find((s) => s.id === stageId)?.stage_type;
  if (type === "hired") return "hired";
  if (type === "rejected") return "rejected";
  return "active";
}

export const applicationHandlers = [
  /**
   * GET /applications
   * Supports ?job_id=, ?candidate_id=, ?stage_id=, ?status= and pagination, newest first.
   */
  http.get(`${BASE}/applications`, ({ request }) => {
    const url = new URL(request.url);
    const filters = ["job_id", "candidate_id", "stage_id", "status"] as const;
    const filtered = applicationsStore
      .filter((a) =>
        filters.every((f) => {
          const wanted = url.searchParams.get(f);
          return !wanted || a[f] === wanted;
        })
      )
      .sort((a, b) => b.applied_at.localeCompare(a.applied_at));

    const response: components["schemas"]["PaginatedApplicationsResponse"] = paginate(
      filtered,
      url
    );
    return HttpResponse.json(response);
  }),

  /**
   * POST /applications
   * Links a candidate to a job in the first stage and synthesises a score record.
   * Returns 409 if the candidate already applied to the job.
   */
  http.post(`${BASE}/applications`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["CreateApplicationRequest"];

    if (
      applicationsStore.some(
        (a) => a.job_id === body.job_id && a.candidate_id === body.candidate_id
      )
    ) {
      return errorResponse(
        409,
        "CONFLICT",
        "This candidate already has an application for this job."
      );
    }

    const now = new Date().toISOString();
    const newApp: ApplicationResponse = {
      id: crypto.randomUUID(),
      org_id: MOCK_ORG_ID,
      job_id: body.job_id,
      candidate_id: body.candidate_id,
      stage_id: mockPipelineStages[0].id,
      status: "active",
      rejection_reason: null,
      applied_at: now,
      updated_at: now,
    };
    applicationsStore = [newApp, ...applicationsStore];
    historyStore[newApp.id] = [
      {
        id: crypto.randomUUID(),
        application_id: newApp.id,
        from_stage_id: null,
        to_stage_id: newApp.stage_id,
        reason: null,
        overall_score: null,
        model_version: null,
        moved_by: MOCK_USER_ID,
        moved_at: now,
      },
    ];

    // Auto-generate a placeholder score for the new application.
    const rand = () => Math.round(Math.random() * 30 + 60); // 60–90
    scoresStore[newApp.id] = {
      id: crypto.randomUUID(),
      application_id: newApp.id,
      overall_score: rand(),
      skill_overlap_score: rand(),
      semantic_score: rand(),
      experience_score: rand(),
      title_fit_score: rand(),
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
   * GET /applications/:id
   */
  http.get(`${BASE}/applications/:id`, ({ params }) => {
    const app = applicationsStore.find((a) => a.id === params.id);
    return app ? HttpResponse.json(app) : notFound("Application", params.id);
  }),

  /**
   * GET /applications/:id/history — stage history, oldest first.
   */
  http.get(`${BASE}/applications/:id/history`, ({ params }) => {
    const history = historyStore[params.id as string];
    return history ? HttpResponse.json(history) : notFound("Application", params.id);
  }),

  /**
   * PATCH /applications/:id/stage — move pipeline stage (drag-and-drop).
   * Moving to the current stage changes nothing; an unknown stage returns 404.
   */
  http.patch(`${BASE}/applications/:id/stage`, async ({ params, request }) => {
    const idx = applicationsStore.findIndex((a) => a.id === params.id);
    if (idx === -1) return notFound("Application", params.id);

    const body = (await request.json()) as components["schemas"]["UpdateStageRequest"];
    if (!mockPipelineStages.some((s) => s.id === body.stage_id)) {
      return notFound("Stage", body.stage_id);
    }

    const current = applicationsStore[idx];
    if (current.stage_id === body.stage_id) return HttpResponse.json(current);

    const now = new Date().toISOString();
    const status = statusForStage(body.stage_id);
    applicationsStore[idx] = {
      ...current,
      stage_id: body.stage_id,
      status,
      rejection_reason: status === "rejected" ? (body.reason ?? null) : null,
      updated_at: now,
    };
    (historyStore[current.id] ??= []).push({
      id: crypto.randomUUID(),
      application_id: current.id,
      from_stage_id: current.stage_id,
      to_stage_id: body.stage_id,
      reason: body.reason ?? null,
      overall_score: null,
      model_version: null,
      moved_by: MOCK_USER_ID,
      moved_at: now,
    });
    return HttpResponse.json(applicationsStore[idx]);
  }),

  /**
   * GET /applications/:id/score — retrieve AI hybrid score breakdown.
   */
  http.get(`${BASE}/applications/:id/score`, ({ params }) => {
    const score = scoresStore[params.id as string];
    return score ? HttpResponse.json(score) : notFound("Score for application", params.id);
  }),
];
