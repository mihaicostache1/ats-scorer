import { http, HttpResponse } from "msw";
import { mockApplications, mockScores, mockStageHistory } from "../fixtures/applications";
import { MOCK_ORG_ID, MOCK_USER_ID } from "../fixtures/auth";
import { mockCandidates } from "../fixtures/candidates";
import { mockJobs, mockPipelineStages } from "../fixtures/jobs";
import { sessionAccount } from "./auth";
import { getMockCandidate, latestMockCv } from "./candidates";
import { getMockJob } from "./jobs";
import type { components } from "@/api/generated/schema";
import { BASE, detailResponse, errorResponse, notFound, paginate } from "./utils";

type ApplicationResponse = components["schemas"]["ApplicationResponse"];
type StageHistoryResponse = components["schemas"]["StageHistoryResponse"];
type ScoreResponse = components["schemas"]["ScoreResponse"];
type RankedCandidate = components["schemas"]["RankedCandidate"];
const viewerStages = ["screening", "interview", "offer", "hired"];
const scoringJobFields = [
  "title",
  "description",
  "required_skills",
  "preferred_skills",
  "min_experience_years",
] as const;

function scoreOutcome(application: ApplicationResponse): ScoreResponse {
  const cv = latestMockCv(application.candidate_id);
  const currentJob = getMockJob(application.job_id);
  const originalJob = mockJobs.find((job) => job.id === application.job_id);
  const candidate = getMockCandidate(application.candidate_id);
  const originalCandidate = mockCandidates.find((entry) => entry.id === application.candidate_id);
  const saved = mockScores[application.id];
  const review = cv?.status === "failed" || cv?.status === "needs_review";
  if (!saved || review) {
    return {
      id: null,
      application_id: application.id,
      status: review ? "needs_manual_review" : "pending",
      score: null,
      band: null,
      model_version: null,
      computed_at: null,
      explanation: null,
    };
  }
  const outdated =
    ["queued", "extracting", "extracted"].includes(cv?.status ?? "") ||
    scoringJobFields.some(
      (field) => JSON.stringify(currentJob?.[field]) !== JSON.stringify(originalJob?.[field])
    ) ||
    candidate?.full_name !== originalCandidate?.full_name ||
    JSON.stringify(candidate?.parsed_data) !== JSON.stringify(originalCandidate?.parsed_data);
  return outdated ? { ...saved, status: "rescoring" } : saved;
}

// Common aliases used by the scorer for the demo jobs.
const skillAliases: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  python3: "python",
  postgres: "postgresql",
  k8s: "kubernetes",
  ml: "machine learning",
  nlp: "natural language processing",
  golang: "go",
  node: "node.js",
  nodejs: "node.js",
  reactjs: "react",
  "react.js": "react",
  aws: "amazon web services",
  gcp: "google cloud platform",
};

function normalizeSkill(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[-*• ]+|[.,;: ]+$/g, "");
  return skillAliases[cleaned] ?? cleaned;
}

function rankedPage(items: RankedCandidate[], url: URL) {
  const result = paginate(items, url);
  if (!items.length) result.pagination.total_pages = 0;
  return result;
}

/** In-memory stores — mutations persist for the browser session. */
let applicationsStore: ApplicationResponse[] = [...mockApplications];
const historyStore: Record<string, StageHistoryResponse[]> = structuredClone(mockStageHistory);

/** Application status follows the type of its current stage. */
function statusForStage(stageId: string): ApplicationResponse["status"] {
  const type = mockPipelineStages.find((s) => s.id === stageId)?.stage_type;
  if (type === "hired") return "hired";
  if (type === "rejected") return "rejected";
  return "active";
}

export const applicationHandlers = [
  http.get(`${BASE}/jobs/:id/ranked-candidates`, ({ params, request, cookies }) => {
    if (sessionAccount(cookies)?.user.role === "viewer") {
      return detailResponse(403, "Not enough privileges");
    }
    const job = getMockJob(params.id);
    if (!job) return notFound("Job", params.id);
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage_id");
    const minScore = url.searchParams.get("min_score");
    const minExperience = url.searchParams.get("min_experience_years");
    const requiredSkill = url.searchParams.get("required_skill");
    const sortBy = url.searchParams.get("sort_by") ?? "score";
    const sortOrder = url.searchParams.get("sort_order") ?? "desc";
    const hasFitFilter = [minScore, minExperience, requiredSkill].some((value) => value !== null);
    const groups = {
      ranked: [] as RankedCandidate[],
      needs_manual_review: [] as RankedCandidate[],
      unranked: [] as RankedCandidate[],
    };
    for (const application of applicationsStore) {
      if (application.job_id !== job.id || (stage && application.stage_id !== stage)) continue;
      const candidate = getMockCandidate(application.candidate_id);
      const pipelineStage = mockPipelineStages.find((entry) => entry.id === application.stage_id);
      if (!candidate || !pipelineStage) continue;
      const { id: _id, explanation, ...summary } = scoreOutcome(application);
      const years = explanation?.experience.candidate_years ?? null;
      if (hasFitFilter && summary.status !== "scored") continue;
      if (minScore !== null && (summary.score === null || summary.score < Number(minScore)))
        continue;
      if (minExperience !== null && (years === null || years < Number(minExperience))) continue;
      if (
        requiredSkill !== null &&
        !explanation?.matched_skills.some(
          (skill) =>
            skill.requirement === "required" &&
            normalizeSkill(skill.skill) === normalizeSkill(requiredSkill)
        )
      )
        continue;
      const group =
        summary.status === "scored"
          ? groups.ranked
          : summary.status === "needs_manual_review"
            ? groups.needs_manual_review
            : groups.unranked;
      group.push({
        ...summary,
        candidate_id: candidate.id,
        full_name: candidate.full_name,
        stage_id: pipelineStage.id,
        stage_name: pipelineStage.name,
        cv_status: latestMockCv(candidate.id)?.status ?? null,
        applied_at: application.applied_at,
        experience_years: years,
      });
    }
    const direction = sortOrder === "asc" ? 1 : -1;
    for (const [name, rows] of Object.entries(groups)) {
      rows.sort((a, b) => {
        const scoreOrder =
          sortBy === "score" && name === "ranked"
            ? ((a.score ?? 0) - (b.score ?? 0)) * direction
            : 0;
        const dateOrder =
          a.applied_at.localeCompare(b.applied_at) * (sortBy === "score" ? -1 : direction);
        return scoreOrder || dateOrder || a.application_id.localeCompare(b.application_id);
      });
    }
    const response: components["schemas"]["RankedCandidatesResponse"] = {
      ranked: rankedPage(groups.ranked, url),
      needs_manual_review: rankedPage(groups.needs_manual_review, url),
      unranked: rankedPage(groups.unranked, url),
      advisory_note: "Scores are advisory. Review the application before making a decision.",
    };
    return HttpResponse.json(response);
  }),

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
   * Links a candidate to a job in the first stage.
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
   * GET /applications/:id/score — retrieve the current score outcome.
   */
  http.get(`${BASE}/applications/:id/score`, ({ params, cookies }) => {
    const application = applicationsStore.find((entry) => entry.id === params.id);
    if (!application) return notFound("Application", params.id);
    const stage = mockPipelineStages.find((entry) => entry.id === application.stage_id);
    if (
      sessionAccount(cookies)?.user.role === "viewer" &&
      !viewerStages.includes(stage?.stage_type ?? "")
    ) {
      return notFound("Application", params.id);
    }
    return HttpResponse.json(scoreOutcome(application));
  }),
];
