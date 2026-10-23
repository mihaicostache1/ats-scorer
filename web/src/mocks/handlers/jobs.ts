import { delay, http, HttpResponse } from "msw";
import { mockJobs, mockPipelineStages } from "../fixtures/jobs";
import { MOCK_ORG_ID } from "../fixtures/auth";
import type { components } from "@/api/generated/schema";
import { BASE, notFound, paginate, sortItems } from "./utils";

type JobResponse = components["schemas"]["JobResponse"];

/** In-memory store — mutations persist for the browser session. */
let jobsStore: JobResponse[] = [...mockJobs];

/** FastAPI-style 422: `{ detail: [{ loc, msg, type }] }`. */
function validationError(problems: { field: string; msg: string }[]): Response {
  return HttpResponse.json(
    { detail: problems.map((p) => ({ loc: ["body", p.field], msg: p.msg, type: "value_error" })) },
    { status: 422 }
  );
}

/** Mirrors the backend's required-text rules (api/app/schemas/job.py). */
function textProblems(
  body: { title?: string; description?: string },
  required: boolean
): { field: string; msg: string }[] {
  const problems: { field: string; msg: string }[] = [];
  for (const field of ["title", "description"] as const) {
    const value = body[field];
    if (value === undefined && !required) continue;
    if (!value?.trim()) problems.push({ field, msg: "String should have at least 1 character" });
  }
  if ((body.title?.length ?? 0) > 255) {
    problems.push({ field: "title", msg: "String should have at most 255 characters" });
  }
  return problems;
}

function updateJob(id: unknown, patch: Partial<JobResponse>): Response {
  const idx = jobsStore.findIndex((j) => j.id === id);
  if (idx === -1) return notFound("Job", id);
  jobsStore[idx] = { ...jobsStore[idx], ...patch, updated_at: new Date().toISOString() };
  return HttpResponse.json(jobsStore[idx]);
}

/** Restores the fixtures; for tests that mutate jobs. */
export function resetJobsStore() {
  jobsStore = [...mockJobs];
}

export const jobHandlers = [
  /**
   * GET /jobs
   * Supports ?status=, ?search=, sorting and pagination. Archived jobs are hidden
   * unless ?status=archived is requested.
   */
  http.get(`${BASE}/jobs`, async ({ request }) => {
    await delay(300); // realistic latency so loading states are visible
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";

    let filtered = status
      ? jobsStore.filter((j) => j.status === status)
      : jobsStore.filter((j) => j.status !== "archived");
    if (search) {
      filtered = filtered.filter((j) =>
        [j.title, j.department, j.location].some((f) => f?.toLowerCase().includes(search))
      );
    }

    const response: components["schemas"]["PaginatedJobsResponse"] = paginate(
      sortItems(filtered, url, "created_at"),
      url
    );
    return HttpResponse.json(response);
  }),

  /**
   * POST /jobs — creates a draft job and prepends it to the in-memory store.
   */
  http.post(`${BASE}/jobs`, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as components["schemas"]["CreateJobRequest"];
    const problems = textProblems(body, true);
    if (problems.length) return validationError(problems);
    const now = new Date().toISOString();
    const newJob: JobResponse = {
      id: crypto.randomUUID(),
      org_id: MOCK_ORG_ID,
      title: body.title,
      department: body.department ?? null,
      location: body.location ?? null,
      employment_type: body.employment_type ?? "full_time",
      status: "draft",
      description: body.description,
      required_skills: body.required_skills ?? [],
      preferred_skills: body.preferred_skills ?? [],
      min_experience_years: body.min_experience_years ?? 0,
      created_at: now,
      updated_at: now,
    };
    jobsStore = [newJob, ...jobsStore];
    return HttpResponse.json(newJob, { status: 201 });
  }),

  /**
   * GET /jobs/:id
   */
  http.get(`${BASE}/jobs/:id`, async ({ params }) => {
    await delay(200);
    const job = jobsStore.find((j) => j.id === params.id);
    return job ? HttpResponse.json(job) : notFound("Job", params.id);
  }),

  /**
   * PATCH /jobs/:id — partial update; status is changed via /status and /archive.
   */
  http.patch(`${BASE}/jobs/:id`, async ({ params, request }) => {
    await delay(300);
    const body = (await request.json()) as components["schemas"]["UpdateJobRequest"];
    const problems = textProblems(body, false);
    if (problems.length) return validationError(problems);
    // Drop undefined keys so omitted fields stay unchanged.
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined)
    ) as Partial<JobResponse>;
    return updateJob(params.id, patch);
  }),

  /**
   * PATCH /jobs/:id/status — move to draft, open or closed.
   */
  http.patch(`${BASE}/jobs/:id/status`, async ({ params, request }) => {
    await delay(300);
    const body = (await request.json()) as components["schemas"]["UpdateJobStatusRequest"];
    if (!["draft", "open", "closed"].includes(body.status)) {
      return validationError([
        { field: "status", msg: "Input should be 'draft', 'open' or 'closed'" },
      ]);
    }
    return updateJob(params.id, { status: body.status });
  }),

  /**
   * POST /jobs/:id/archive — idempotent.
   */
  http.post(`${BASE}/jobs/:id/archive`, async ({ params }) => {
    await delay(300);
    return updateJob(params.id, { status: "archived" });
  }),

  /**
   * GET /jobs/:id/stages
   * Jobs without their own stages fall back to the organization defaults (job_id null).
   */
  http.get(`${BASE}/jobs/:id/stages`, ({ params }) => {
    const job = jobsStore.find((j) => j.id === params.id);
    if (!job) return notFound("Job", params.id);
    return HttpResponse.json(mockPipelineStages);
  }),
];
