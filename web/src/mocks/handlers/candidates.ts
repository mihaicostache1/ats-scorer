import { http, HttpResponse } from "msw";
import { mockCandidates } from "../fixtures/candidates";
import { MOCK_ORG_ID } from "../fixtures/auth";
import type { components } from "@/api/generated/schema";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type CandidateResponse = components["schemas"]["CandidateResponse"];

/** In-memory store — mutations persist for the browser session. */
let candidatesStore: CandidateResponse[] = [...mockCandidates];

function notFound(id: unknown): Response {
  return HttpResponse.json(
    {
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: `Candidate with ID '${id}' was not found.`,
        timestamp: new Date().toISOString(),
        request_id: `req_${Date.now()}`,
      },
    } satisfies components["schemas"]["ErrorEnvelope"],
    { status: 404 }
  );
}

export const candidateHandlers = [
  /**
   * GET /candidates
   * Supports ?search= (full-name / email) and pagination.
   */
  http.get(`${BASE}/candidates`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";
    const page = Number(url.searchParams.get("page") ?? 1);
    const perPage = Number(url.searchParams.get("per_page") ?? 20);

    const filtered = search
      ? candidatesStore.filter(
          (c) =>
            c.full_name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search)
        )
      : candidatesStore;

    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

    const response: components["schemas"]["PaginatedCandidatesResponse"] = {
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
   * POST /candidates/upload
   * Simulates PDF parsing: returns a CandidateUploadResponse with preset parsed_data.
   * Adds the new candidate to the in-memory store.
   */
  http.post(`${BASE}/candidates/upload`, async ({ request }) => {
    const form = await request.formData();
    const fullName = (form.get("full_name") as string | null) ?? "Unknown Candidate";
    const email = (form.get("email") as string | null) ?? `candidate_${Date.now()}@example.com`;

    const newCandidate: CandidateResponse = {
      id: crypto.randomUUID(),
      org_id: MOCK_ORG_ID,
      full_name: fullName,
      email,
      ocr_used: false,
      parsed_data: {
        skills: ["TypeScript", "React", "Node.js"],
        experience_years: 3.0,
        education: ["B.Sc. Computer Science"],
        work_history: [{ title: "Software Engineer", company: "SomeCo", years: 3.0 }],
      },
    };
    candidatesStore = [newCandidate, ...candidatesStore];
    return HttpResponse.json(newCandidate, { status: 201 });
  }),

  /**
   * GET /candidates/:id
   */
  http.get(`${BASE}/candidates/:id`, ({ params }) => {
    const candidate = candidatesStore.find((c) => c.id === params.id);
    if (!candidate) return notFound(params.id);
    return HttpResponse.json(candidate);
  }),

  /**
   * PATCH /candidates/:id — partial update of name / email / phone / skills.
   */
  http.patch(`${BASE}/candidates/:id`, async ({ params, request }) => {
    const idx = candidatesStore.findIndex((c) => c.id === params.id);
    if (idx === -1) return notFound(params.id);

    const body = (await request.json()) as components["schemas"]["UpdateCandidateRequest"];
    const existing = candidatesStore[idx];

    const updated: CandidateResponse = {
      ...existing,
      full_name: body.full_name ?? existing.full_name,
      email: body.email ?? existing.email,
      phone: body.phone ?? existing.phone,
      parsed_data: {
        ...existing.parsed_data,
        skills: body.skills ?? existing.parsed_data.skills,
      },
    };
    candidatesStore[idx] = updated;
    return HttpResponse.json(updated);
  }),

  /**
   * DELETE /candidates/:id — GDPR hard delete.
   */
  http.delete(`${BASE}/candidates/:id`, ({ params }) => {
    const idx = candidatesStore.findIndex((c) => c.id === params.id);
    if (idx === -1) return notFound(params.id);
    candidatesStore.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
