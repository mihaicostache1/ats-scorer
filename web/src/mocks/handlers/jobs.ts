import { http, HttpResponse } from "msw";
import { mockJobs, mockPipelineStages, mockPaginatedJobs } from "../fixtures/jobs";
import type { components } from "@/api/generated/schema";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** In-memory store — mutations persist for the browser session. */
let jobsStore: components["schemas"]["JobResponse"][] = [...mockJobs];

export const jobHandlers = [
  /**
   * GET /jobs
   * Supports optional ?status= filter and pagination query params (mocked).
   */
  http.get(`${BASE}/jobs`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const page = Number(url.searchParams.get("page") ?? 1);
    const perPage = Number(url.searchParams.get("per_page") ?? 20);

    const filtered = status ? jobsStore.filter((j) => j.status === status) : jobsStore;
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

    const response: components["schemas"]["PaginatedJobsResponse"] = {
      items,
      pagination: {
        page,
        per_page: perPage,
        total_items: filtered.length,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
    return HttpResponse.json(response);
  }),

  /**
   * POST /jobs — creates a new job and prepends it to the in-memory store.
   */
  http.post(`${BASE}/jobs`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["CreateJobRequest"];
    const newJob: components["schemas"]["JobResponse"] = {
      id: crypto.randomUUID(),
      org_id: mockPaginatedJobs.items[0].org_id,
      title: body.title,
      department: body.department,
      location: body.location,
      employment_type: body.employment_type,
      status: "open",
      description: body.description,
      required_skills: body.required_skills ?? [],
      preferred_skills: body.preferred_skills ?? [],
      min_experience_years: body.min_experience_years,
      created_at: new Date().toISOString(),
    };
    jobsStore = [newJob, ...jobsStore];
    return HttpResponse.json(newJob, { status: 201 });
  }),

  /**
   * GET /jobs/:id
   */
  http.get(`${BASE}/jobs/:id`, ({ params }) => {
    const job = jobsStore.find((j) => j.id === params.id);
    if (!job) {
      return HttpResponse.json(
        {
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `Job with ID '${params.id}' was not found.`,
            timestamp: new Date().toISOString(),
            request_id: `req_${Date.now()}`,
          },
        } satisfies components["schemas"]["ErrorEnvelope"],
        { status: 404 }
      );
    }
    return HttpResponse.json(job);
  }),

  /**
   * GET /jobs/:id/stages
   * Returns the shared pipeline stages for whichever job is requested.
   */
  http.get(`${BASE}/jobs/:id/stages`, ({ params }) => {
    const job = jobsStore.find((j) => j.id === params.id);
    if (!job) {
      return HttpResponse.json(
        {
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `Job with ID '${params.id}' was not found.`,
            timestamp: new Date().toISOString(),
            request_id: `req_${Date.now()}`,
          },
        } satisfies components["schemas"]["ErrorEnvelope"],
        { status: 404 }
      );
    }
    // Return stages associated with first mock job; job_id rewritten to the requested one.
    const stages = mockPipelineStages.map((s) => ({ ...s, job_id: job.id }));
    return HttpResponse.json(stages);
  }),
];
