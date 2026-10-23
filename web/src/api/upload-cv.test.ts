import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR_MESSAGE } from "@/lib/api-error";

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }));
vi.mock("@/api/client", () => ({ refreshSession }));

import { uploadCandidateCvWithProgress } from "./upload-cv";

/** Just enough of XMLHttpRequest to drive the upload by hand. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null };
  withCredentials = false;
  status = 0;
  responseText = "";
  method = "";
  url = "";
  body: unknown;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.instances.push(this);
  }
  abort() {
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.onload?.();
  }
}

const file = new File(["%PDF-1.4 ... %%EOF"], "cv.pdf", { type: "application/pdf" });
const cv = { id: "cv-1", status: "queued" };

beforeEach(() => {
  FakeXhr.instances = [];
  refreshSession.mockReset();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});
afterEach(() => vi.unstubAllGlobals());

describe("uploadCandidateCvWithProgress", () => {
  it("posts the file as multipart form data with the session cookie", async () => {
    const result = uploadCandidateCvWithProgress("cand 1", file);
    const xhr = FakeXhr.instances[0];

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toMatch(/\/candidates\/cand%201\/cv$/);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.body).toBeInstanceOf(FormData);
    expect((xhr.body as FormData).get("file")).toBeInstanceOf(File);

    xhr.respond(201, cv);
    expect(await result).toEqual({ ok: true, data: cv });
  });

  it("reports progress as a whole percentage", async () => {
    const onProgress = vi.fn();
    const result = uploadCandidateCvWithProgress("c", file, { onProgress });
    const xhr = FakeXhr.instances[0];

    xhr.progress(0, 200);
    xhr.progress(50, 200);
    xhr.progress(133, 200);
    xhr.progress(200, 200);
    xhr.respond(201, cv);
    await result;

    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([0, 25, 67, 100]);
  });

  it("ignores progress events with no known total", async () => {
    const onProgress = vi.fn();
    const result = uploadCandidateCvWithProgress("c", file, { onProgress });
    const xhr = FakeXhr.instances[0];
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 });
    xhr.respond(201, cv);
    await result;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("turns an API error into a message a person can read", async () => {
    const result = uploadCandidateCvWithProgress("c", file);
    FakeXhr.instances[0].respond(415, { detail: "Only PDF files are accepted." });
    expect(await result).toEqual({
      ok: false,
      aborted: false,
      message: "Only PDF files are accepted.",
      status: 415,
    });
  });

  it("copes with an error body that isn't JSON", async () => {
    const result = uploadCandidateCvWithProgress("c", file);
    FakeXhr.instances[0].respond(502, "<html>Bad gateway</html>");
    expect(await result).toMatchObject({ ok: false, status: 502 });
  });

  it("reports a request that never arrived as a connection problem", async () => {
    const result = uploadCandidateCvWithProgress("c", file);
    FakeXhr.instances[0].onerror?.();
    expect(await result).toEqual({
      ok: false,
      aborted: false,
      message: NETWORK_ERROR_MESSAGE,
      status: 0,
    });
  });

  it("can be cancelled while sending", async () => {
    const controller = new AbortController();
    const result = uploadCandidateCvWithProgress("c", file, { signal: controller.signal });
    controller.abort();
    expect(await result).toEqual({ ok: false, aborted: true });
  });

  it("does not send at all if it was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await uploadCandidateCvWithProgress("c", file, { signal: controller.signal })).toEqual({
      ok: false,
      aborted: true,
    });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  describe("when the session has expired", () => {
    it("refreshes it once and sends the file again", async () => {
      refreshSession.mockResolvedValue(true);
      const onProgress = vi.fn();
      const result = uploadCandidateCvWithProgress("c", file, { onProgress });
      FakeXhr.instances[0].respond(401, { detail: "Not authenticated" });

      await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      FakeXhr.instances[1].respond(201, cv);

      expect(await result).toEqual({ ok: true, data: cv });
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(0); // the bar starts over
    });

    it("gives up if the refresh fails", async () => {
      refreshSession.mockResolvedValue(false);
      const result = uploadCandidateCvWithProgress("c", file);
      FakeXhr.instances[0].respond(401, { detail: "Not authenticated" });

      expect(await result).toMatchObject({ ok: false, status: 401, message: "Not authenticated" });
      expect(FakeXhr.instances).toHaveLength(1);
    });

    it("does not loop if the second attempt is also refused", async () => {
      refreshSession.mockResolvedValue(true);
      const result = uploadCandidateCvWithProgress("c", file);
      FakeXhr.instances[0].respond(401, { detail: "Not authenticated" });
      await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      FakeXhr.instances[1].respond(401, { detail: "Not authenticated" });

      expect(await result).toMatchObject({ ok: false, status: 401 });
      expect(refreshSession).toHaveBeenCalledTimes(1);
    });
  });
});
