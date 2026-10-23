// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { mockCandidates, mockCvDocuments } from "../fixtures/candidates";
import { candidateHandlers, resetCvStore } from "../handlers/candidates";
import { BASE } from "../handlers/utils";
import { CV_SCENARIOS, scenarioForFile } from "./cv-scenarios";

/**
 * Runs every CV scenario through the real mock handlers, the way the browser would, and checks
 * that each one produces exactly the states it promises. The last test fails if a scenario is
 * added without a test here, so no state can become impossible to reproduce.
 */

/**
 * Calls the mock handlers directly, with no network layer. (`msw/node`'s `setupServer` needs Node 22
 * or later, and CI runs Node 20.) No session guard is involved: these tests are about the CV routes,
 * not sign-in. Like a real `fetch`, a dropped connection throws.
 */
async function callApi(url: string, init?: RequestInit): Promise<Response> {
  const request = new Request(url, init);
  for (const handler of candidateHandlers) {
    const result = await handler.run({ request: request.clone(), requestId: crypto.randomUUID() });
    if (!result?.response) continue;
    if (result.response.type === "error") throw new TypeError("Failed to fetch");
    return result.response;
  }
  throw new Error(`No mock handler for ${request.method} ${url}`);
}

beforeEach(() => resetCvStore());

const candidateId = mockCandidates[0].id;
const cvUrl = `${BASE}/candidates/${candidateId}/cv`;

/** A PDF the server will accept: header, padding to `size`, trailer. */
function pdf(name: string, size = 200): File {
  const head = "%PDF-1.4\n";
  const tail = "\n%%EOF";
  const body = head + "x".repeat(Math.max(0, size - head.length - tail.length)) + tail;
  return new File([body], name, { type: "application/pdf" });
}

async function upload(file: File) {
  const form = new FormData();
  form.append("file", file);
  return callApi(cvUrl, { method: "POST", body: form });
}

type Cv = {
  id: string;
  status: string;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  page_count: number | null;
  ocr_used: boolean;
  processed_at: string | null;
};

async function uploaded(marker: string): Promise<Cv> {
  const response = await upload(pdf(`candidate-${marker}.pdf`));
  expect(response.status).toBe(201);
  return response.json();
}

const poll = (id: string) => callApi(`${cvUrl}/${id}`);
const pollJson = async (id: string): Promise<Cv> => (await poll(id)).json();
const retry = (id: string) => callApi(`${cvUrl}/${id}/retry`, { method: "POST" });

/** Statuses seen on successive polls, stopping at the first final one (or after `max`). */
async function pollStatuses(id: string, max = 20): Promise<Cv[]> {
  const seen: Cv[] = [];
  for (let i = 0; i < max; i++) {
    const cv = await pollJson(id);
    seen.push(cv);
    if (["extracted", "parsed", "needs_review", "failed"].includes(cv.status)) break;
  }
  return seen;
}

const covered = new Set<string>();
function scenario(marker: string, run: () => Promise<void>) {
  it(`scenario: ${marker}`, async () => {
    covered.add(marker);
    await run();
  });
}

describe("scenarioForFile", () => {
  it("defaults to the happy path", () => {
    expect(scenarioForFile("priya-nair-cv.pdf").marker).toBe("parsed");
  });

  it("finds a marker between separators, in any case", () => {
    expect(scenarioForFile("Alex_Needs-Review.PDF").marker).toBe("needs-review");
    expect(scenarioForFile("upload 413.pdf").marker).toBe("upload-413");
  });

  it("does not match a marker inside an ordinary word", () => {
    expect(scenarioForFile("Procrustes.pdf").marker).toBe("parsed"); // contains "ocr"
    expect(scenarioForFile("slowinski.pdf").marker).toBe("parsed");
  });
});

describe("CV upload scenarios", () => {
  scenario("parsed", async () => {
    const cv = await uploaded("parsed");
    expect(cv).toMatchObject({ status: "queued", attempts: 0, processed_at: null });
    const seen = await pollStatuses(cv.id);
    expect(seen.map((s) => s.status)).toEqual(["extracting", "parsed"]);
    expect(seen[1].processed_at).not.toBeNull();
  });

  scenario("needs-review", async () => {
    const cv = await uploaded("needs-review");
    expect((await pollStatuses(cv.id)).map((s) => s.status)).toEqual([
      "extracting",
      "needs_review",
    ]);
  });

  scenario("extracted", async () => {
    const cv = await uploaded("extracted");
    expect((await pollStatuses(cv.id)).map((s) => s.status)).toEqual(["extracting", "extracted"]);
  });

  scenario("ocr", async () => {
    const cv = await uploaded("ocr");
    const last = (await pollStatuses(cv.id)).at(-1);
    expect(last).toMatchObject({ status: "parsed", ocr_used: true, page_count: 4 });
  });

  scenario("slow", async () => {
    const cv = await uploaded("slow");
    const seen = await pollStatuses(cv.id);
    expect(seen.length).toBeGreaterThanOrEqual(7);
    expect(seen.slice(1, -1).every((s) => s.status === "extracting")).toBe(true);
    expect(seen.at(-1)?.status).toBe("parsed");
  });

  scenario("stuck", async () => {
    const cv = await uploaded("stuck");
    const seen = await pollStatuses(cv.id, 15);
    expect(seen).toHaveLength(15);
    expect(seen.every((s) => s.status === "queued")).toBe(true);
  });

  scenario("timeout", async () => {
    const cv = await uploaded("timeout");
    const seen = await pollStatuses(cv.id);
    expect(seen.map((s) => [s.status, s.attempts])).toEqual([
      ["extracting", 1],
      ["queued", 1],
      ["extracting", 2],
      ["queued", 2],
      ["extracting", 3],
      ["failed", 3],
    ]);
    // Between attempts the document is back in the queue with its error still attached.
    expect(seen[1]).toMatchObject({ error_code: "timeout" });
    expect(seen.at(-1)?.error_message).toMatch(/Gave up after 3 attempts\.$/);
  });

  for (const [marker, code, message] of [
    ["encrypted", "encrypted_pdf", "The PDF is password-protected and cannot be read."],
    ["corrupt", "invalid_pdf", "The file is damaged and could not be opened as a PDF."],
    ["no-text", "no_text_found", "No text was found in the PDF."],
    ["too-many-pages", "too_many_pages", "The PDF has 80 pages; the limit is 50."],
  ] as const) {
    scenario(marker, async () => {
      const cv = await uploaded(marker);
      const last = (await pollStatuses(cv.id)).at(-1);
      expect(last).toMatchObject({ status: "failed", error_code: code, error_message: message });
    });
  }

  scenario("fail-then-ok", async () => {
    const cv = await uploaded("fail-then-ok");
    expect((await pollStatuses(cv.id)).at(-1)).toMatchObject({
      status: "failed",
      error_code: "internal_error",
    });

    const retried = await retry(cv.id);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      status: "queued",
      attempts: 0,
      error_code: null,
      error_message: null,
    });
    expect((await pollStatuses(cv.id)).map((s) => s.status)).toEqual(["extracting", "parsed"]);
  });

  scenario("queue-down", async () => {
    const cv = await uploaded("queue-down");
    expect(cv).toMatchObject({ status: "failed", error_code: "queue_unavailable" });

    // Still down: the first retry fails again.
    const first = await (await retry(cv.id)).json();
    expect(first).toMatchObject({ status: "failed", error_code: "queue_unavailable" });
    // Back up: the second goes through.
    const second = await (await retry(cv.id)).json();
    expect(second).toMatchObject({ status: "queued", error_code: null });
    expect((await pollStatuses(cv.id)).at(-1)?.status).toBe("parsed");
  });

  scenario("poll-error", async () => {
    const cv = await uploaded("poll-error");
    expect((await poll(cv.id)).status).toBe(500);
    expect((await poll(cv.id)).status).toBe(500);
    // Then it recovers, and the CV still moves through all its states.
    expect((await pollStatuses(cv.id)).map((s) => s.status)).toEqual(["extracting", "parsed"]);
  });

  scenario("poll-lost", async () => {
    const cv = await uploaded("poll-lost");
    await expect(poll(cv.id)).rejects.toThrow();
    await expect(poll(cv.id)).rejects.toThrow();
  });

  for (const [marker, status, detail] of [
    ["upload-413", 413, "The file is larger than the 10 MB limit."],
    ["upload-415", 415, "Only PDF files are accepted."],
    ["upload-403", 403, "Not enough privileges"],
    ["upload-404", 404, "Candidate with ID 'x' was not found."],
    ["upload-500", 500, "Internal Server Error"],
  ] as const) {
    scenario(marker, async () => {
      const response = await upload(pdf(`candidate-${marker}.pdf`));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ detail });
    });
  }

  scenario("upload-offline", async () => {
    await expect(upload(pdf("candidate-upload-offline.pdf"))).rejects.toThrow();
  });

  it("has a test for every scenario", () => {
    expect([...covered].sort()).toEqual(CV_SCENARIOS.map((s) => s.marker).sort());
  });
});

describe("upload checks (same as the real API)", () => {
  it("accepts exactly 10 MiB and rejects one byte more with 413", async () => {
    const limit = 10 * 1024 * 1024;
    expect((await upload(pdf("a.pdf", limit))).status).toBe(201);
    const tooBig = await upload(pdf("b.pdf", limit + 1));
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ detail: "The file is larger than the 10 MB limit." });
  });

  it("rejects content that is not a PDF with 415, whatever the name", async () => {
    const text = new File(["just some text"], "cv.pdf", { type: "application/pdf" });
    expect((await upload(text)).status).toBe(415);
    const truncated = new File(["%PDF-1.4 no trailer"], "cut.pdf");
    expect((await upload(truncated)).status).toBe(415);
    expect((await upload(new File([], "empty.pdf"))).status).toBe(415);
    // A real PDF with the wrong extension is fine.
    expect((await upload(pdf("notes.txt"))).status).toBe(201);
  });

  it("returns 422 when the file part is missing", async () => {
    const response = await callApi(cvUrl, { method: "POST", body: new FormData() });
    expect(response.status).toBe(422);
  });

  it("returns 404 for an unknown candidate", async () => {
    const response = await callApi(`${BASE}/candidates/${crypto.randomUUID()}/cv`, {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.append("file", pdf("a.pdf"));
        return form;
      })(),
    });
    expect(response.status).toBe(404);
  });
});

describe("retry rules (same as the real API)", () => {
  it("answers 409 for a CV that cannot be retried", async () => {
    const cv = await uploaded("parsed");
    await pollStatuses(cv.id);
    const response = await retry(cv.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      detail: "A CV document with status 'parsed' cannot be retried.",
    });
  });

  it("leaves a queued CV as it is", async () => {
    const cv = await uploaded("stuck");
    expect(await (await retry(cv.id)).json()).toMatchObject({ id: cv.id, status: "queued" });
  });

  it("answers 404 for an unknown CV", async () => {
    expect((await retry(crypto.randomUUID())).status).toBe(404);
  });
});

describe("CVs already in the fixtures", () => {
  it("carry on processing when someone opens the profile", async () => {
    const queued = mockCvDocuments.find((d) => d.status === "queued")!;
    const url = `${BASE}/candidates/${queued.candidate_id}/cv/${queued.id}`;
    const statuses: string[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await (await callApi(url)).json()).status);
    expect(statuses).toEqual(["extracting", "parsed", "parsed"]);
  });

  it("do not move on a plain list request", async () => {
    const queued = mockCvDocuments.find((d) => d.status === "queued")!;
    const list = await (await callApi(`${BASE}/candidates/${queued.candidate_id}/cv`)).json();
    expect(list.find((d: Cv) => d.id === queued.id).status).toBe("queued");
  });
});
