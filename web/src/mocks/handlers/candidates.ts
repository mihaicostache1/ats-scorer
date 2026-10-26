import { http, HttpResponse } from "msw";
import { mockCandidates, mockCvDocuments } from "../fixtures/candidates";
import { MOCK_ORG_ID, MOCK_USER_ID } from "../fixtures/auth";
import {
  CV_SCENARIOS,
  scenarioForFile,
  type CvPatch,
  type CvScenario,
} from "../scenarios/cv-scenarios";
import type { components } from "@/api/generated/schema";
import { BASE, detailResponse, errorResponse, notFound, paginate, sortItems, wait } from "./utils";

type CandidateResponse = components["schemas"]["CandidateResponse"];
type CvDocumentResponse = components["schemas"]["CvDocumentResponse"];

const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;
const TERMINAL = ["extracted", "parsed", "needs_review", "failed"];

/** In-memory stores — mutations persist for the browser session. */
let candidatesStore: CandidateResponse[] = [...mockCandidates];
let cvStore: CvDocumentResponse[] = [...mockCvDocuments];

/**
 * Where each CV is in its scenario. A status poll moves it one step on; the clock plays no part, so
 * what a poll sees is always the same for the same file.
 */
interface Runtime {
  scenario: CvScenario;
  steps: CvPatch[];
  step: number;
  retries: number;
  pollsSeen: number;
}
const runtimes = new Map<string, Runtime>();

const defaultScenario = CV_SCENARIOS[0];

/** CVs already in the fixtures that are mid-processing carry on from where they are. */
function seedRuntimes() {
  runtimes.clear();
  for (const doc of cvStore) {
    if (TERMINAL.includes(doc.status)) continue;
    runtimes.set(doc.id, {
      scenario: defaultScenario,
      steps: defaultScenario.steps,
      step: doc.status === "extracting" ? 1 : 0,
      retries: 0,
      pollsSeen: 0,
    });
  }
}
seedRuntimes();

/** Restores the fixtures; for tests that upload or retry CVs. */
export function resetCvStore() {
  cvStore = [...mockCvDocuments];
  seedRuntimes();
}

function apply(doc: CvDocumentResponse, patch: CvPatch): CvDocumentResponse {
  const now = new Date().toISOString();
  const next = { ...doc, ...patch, updated_at: now };
  if (patch.status && TERMINAL.includes(patch.status)) next.processed_at = now;
  return next;
}

function save(doc: CvDocumentResponse) {
  cvStore = cvStore.map((d) => (d.id === doc.id ? doc : d));
}

/** The server's check: a `%PDF-` header and a `%%EOF` trailer in the last 1024 bytes. */
async function looksLikePdf(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = (from: number, to: number) => new TextDecoder().decode(bytes.slice(from, to));
  return (
    text(0, 5) === "%PDF-" && text(Math.max(0, bytes.length - 1024), bytes.length).includes("%%EOF")
  );
}

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
  http.get(`${BASE}/candidates`, async ({ request }) => {
    await wait(300); // realistic latency so loading states are visible
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
  http.get(`${BASE}/candidates/:id`, async ({ params }) => {
    await wait(200);
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
   * GET /candidates/:id/cv — CV documents, newest first. Does not move any CV along.
   */
  http.get(`${BASE}/candidates/:id/cv`, async ({ params }) => {
    await wait(300);
    if (!candidatesStore.some((c) => c.id === params.id)) return notFound("Candidate", params.id);
    const docs = cvStore
      .filter((d) => d.candidate_id === params.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json(docs);
  }),

  /**
   * POST /candidates/:id/cv — multipart upload with a `file` field.
   * Checks like the real API (413 over 10 MB, 415 unless the content is a PDF), then picks a
   * processing scenario from the file name (see web/README.md, "CV upload scenarios").
   */
  http.post(`${BASE}/candidates/:id/cv`, async ({ params, request }) => {
    await wait(200);
    if (!candidatesStore.some((c) => c.id === params.id)) return notFound("Candidate", params.id);

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return HttpResponse.json(
        { detail: [{ loc: ["body", "file"], msg: "Field required", type: "missing" }] },
        { status: 422 }
      );
    }
    if (file.size > MAX_CV_SIZE_BYTES) {
      return detailResponse(413, "The file is larger than the 10 MB limit.");
    }
    if (!(await looksLikePdf(file))) return detailResponse(415, "Only PDF files are accepted.");

    const scenario = scenarioForFile(file.name);
    if (scenario.uploadError === "network") return HttpResponse.error();
    if (scenario.uploadError) {
      return detailResponse(scenario.uploadError.status, scenario.uploadError.detail);
    }

    const now = new Date().toISOString();
    const doc = apply(
      {
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
        page_count: null,
        ocr_used: false,
        error_code: null,
        error_message: null,
        attempts: 0,
        processed_at: null,
        uploaded_by: MOCK_USER_ID,
        created_at: now,
        updated_at: now,
      },
      scenario.initial ?? {}
    );
    cvStore = [doc, ...cvStore];
    runtimes.set(doc.id, { scenario, steps: scenario.steps, step: 0, retries: 0, pollsSeen: 0 });
    return HttpResponse.json(doc, { status: 201 });
  }),

  /**
   * GET /candidates/:id/cv/:cvId — the status poll. Each call moves the CV one step through its
   * scenario, until the scenario has nothing left.
   */
  http.get(`${BASE}/candidates/:id/cv/:cvId`, async ({ params }) => {
    await wait(150);
    const doc = cvStore.find((d) => d.id === params.cvId && d.candidate_id === params.id);
    if (!doc) return notFound("CV document", params.cvId);

    const runtime = runtimes.get(doc.id);
    if (!runtime) return HttpResponse.json(doc);

    runtime.pollsSeen += 1;
    const failure = runtime.scenario.pollFailure;
    if (failure && (failure.count === undefined || runtime.pollsSeen <= failure.count)) {
      return failure.kind === "network"
        ? HttpResponse.error()
        : detailResponse(500, "Internal Server Error");
    }

    if (runtime.step < runtime.steps.length) {
      const next = apply(doc, runtime.steps[runtime.step]);
      runtime.step += 1;
      save(next);
      return HttpResponse.json(next);
    }
    return HttpResponse.json(doc);
  }),

  /**
   * POST /candidates/:id/cv/:cvId/retry — like the real API: a failed CV goes back to the queue,
   * one that is still queued or extracting is queued again unchanged, anything else is a 409.
   */
  http.post(`${BASE}/candidates/:id/cv/:cvId/retry`, async ({ params }) => {
    await wait(200);
    const doc = cvStore.find((d) => d.id === params.cvId && d.candidate_id === params.id);
    if (!doc) return notFound("CV document", params.cvId);

    if (doc.status === "queued" || doc.status === "extracting") return HttpResponse.json(doc);
    if (doc.status !== "failed") {
      return detailResponse(409, `A CV document with status '${doc.status}' cannot be retried.`);
    }

    const runtime = runtimes.get(doc.id);
    const plans = runtime?.scenario.retries;
    const plan = plans ? plans[Math.min(runtime?.retries ?? 0, plans.length - 1)] : undefined;
    // Without a scripted retry, it goes back to the queue and then follows the default scenario.
    const response: CvPatch = plan?.response ?? {
      status: "queued",
      attempts: 0,
      error_code: null,
      error_message: null,
    };
    const next = apply(doc, response);
    save(next);
    runtimes.set(doc.id, {
      scenario: runtime?.scenario ?? defaultScenario,
      steps: plan ? plan.steps : defaultScenario.steps,
      step: 0,
      retries: (runtime?.retries ?? 0) + 1,
      pollsSeen: 0,
    });
    return HttpResponse.json(next);
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
