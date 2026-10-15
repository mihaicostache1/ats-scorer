import { http, HttpResponse } from "msw";
import { mockCandidates, mockCvDocuments } from "../fixtures/candidates";
import { MOCK_ORG_ID, MOCK_USER_ID } from "../fixtures/auth";
import type { components } from "@/api/generated/schema";
import { BASE, errorResponse, notFound, paginate, sortItems } from "./utils";

type CandidateResponse = components["schemas"]["CandidateResponse"];
type CvDocumentResponse = components["schemas"]["CvDocumentResponse"];

const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

/** In-memory stores — mutations persist for the browser session. */
let candidatesStore: CandidateResponse[] = [...mockCandidates];
let cvStore: CvDocumentResponse[] = [...mockCvDocuments];

/** Minimal valid PDF served by the download endpoint. */
const MOCK_PDF =
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
  "trailer<</Root 1 0 R>>\n%%EOF";

export const candidateHandlers = [
  /**
   * GET /candidates
   * Supports ?search= (full name / email), sorting and pagination.
   */
  http.get(`${BASE}/candidates`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";
    const filtered = search
      ? candidatesStore.filter(
          (c) =>
            c.full_name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search)
        )
      : candidatesStore;

    const response: components["schemas"]["PaginatedCandidatesResponse"] = paginate(
      sortItems(filtered, url, "created_at"),
      url
    );
    return HttpResponse.json(response);
  }),

  /**
   * POST /candidates — emails are stored lowercase and unique per organization.
   */
  http.post(`${BASE}/candidates`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["CreateCandidateRequest"];
    const email = body.email.toLowerCase();
    if (candidatesStore.some((c) => c.email.toLowerCase() === email)) {
      return errorResponse(409, "CONFLICT", "A candidate with this email already exists.");
    }
    const now = new Date().toISOString();
    const candidate: CandidateResponse = {
      id: crypto.randomUUID(),
      org_id: MOCK_ORG_ID,
      full_name: body.full_name,
      email,
      phone: body.phone ?? null,
      location: body.location ?? null,
      cv_file_path: null,
      parsed_data: {},
      consent_given_at: body.consent_given_at ?? null,
      created_at: now,
      updated_at: now,
    };
    candidatesStore = [candidate, ...candidatesStore];
    return HttpResponse.json(candidate, { status: 201 });
  }),

  /**
   * GET /candidates/:id
   */
  http.get(`${BASE}/candidates/:id`, ({ params }) => {
    const candidate = candidatesStore.find((c) => c.id === params.id);
    return candidate ? HttpResponse.json(candidate) : notFound("Candidate", params.id);
  }),

  /**
   * PATCH /candidates/:id — partial update; omitted fields are left unchanged.
   */
  http.patch(`${BASE}/candidates/:id`, async ({ params, request }) => {
    const idx = candidatesStore.findIndex((c) => c.id === params.id);
    if (idx === -1) return notFound("Candidate", params.id);

    const body = (await request.json()) as components["schemas"]["UpdateCandidateRequest"];
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined)
    ) as Partial<CandidateResponse>;
    if (typeof patch.email === "string") patch.email = patch.email.toLowerCase();

    candidatesStore[idx] = {
      ...candidatesStore[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(candidatesStore[idx]);
  }),

  /**
   * DELETE /candidates/:id — GDPR hard delete, also removes the candidate's CV documents.
   */
  http.delete(`${BASE}/candidates/:id`, ({ params }) => {
    const idx = candidatesStore.findIndex((c) => c.id === params.id);
    if (idx === -1) return notFound("Candidate", params.id);
    candidatesStore.splice(idx, 1);
    cvStore = cvStore.filter((d) => d.candidate_id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  /**
   * GET /candidates/:id/cv — CV documents, newest first.
   */
  http.get(`${BASE}/candidates/:id/cv`, ({ params }) => {
    if (!candidatesStore.some((c) => c.id === params.id)) return notFound("Candidate", params.id);
    const docs = cvStore
      .filter((d) => d.candidate_id === params.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json(docs);
  }),

  /**
   * POST /candidates/:id/cv — multipart upload with a `file` field.
   * Rejects files over 10 MB (413) and files that are not PDFs (415).
   */
  http.post(`${BASE}/candidates/:id/cv`, async ({ params, request }) => {
    if (!candidatesStore.some((c) => c.id === params.id)) return notFound("Candidate", params.id);

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return errorResponse(422, "VALIDATION_ERROR", "A `file` field is required.");
    }
    if (file.size > MAX_CV_SIZE_BYTES) {
      return errorResponse(413, "FILE_TOO_LARGE", "The file is larger than 10 MB.");
    }
    const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (head !== "%PDF-") {
      return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "The file content is not a PDF.");
    }

    const now = new Date().toISOString();
    const doc: CvDocumentResponse = {
      id: crypto.randomUUID(),
      org_id: MOCK_ORG_ID,
      candidate_id: String(params.id),
      original_filename: file.name,
      content_type: "application/pdf",
      size_bytes: file.size,
      sha256: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0")
      ).join(""),
      status: "queued",
      uploaded_by: MOCK_USER_ID,
      created_at: now,
      updated_at: now,
    };
    cvStore = [doc, ...cvStore];
    return HttpResponse.json(doc, { status: 201 });
  }),

  /**
   * GET /candidates/:id/cv/:cvId
   */
  http.get(`${BASE}/candidates/:id/cv/:cvId`, ({ params }) => {
    const doc = cvStore.find((d) => d.id === params.cvId && d.candidate_id === params.id);
    return doc ? HttpResponse.json(doc) : notFound("CV document", params.cvId);
  }),

  /**
   * GET /candidates/:id/cv/:cvId/download — serves a tiny placeholder PDF as an attachment.
   */
  http.get(`${BASE}/candidates/:id/cv/:cvId/download`, ({ params }) => {
    const doc = cvStore.find((d) => d.id === params.cvId && d.candidate_id === params.id);
    if (!doc) return notFound("CV document", params.cvId);
    return new HttpResponse(MOCK_PDF, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${doc.original_filename}"`,
      },
    });
  }),
];
