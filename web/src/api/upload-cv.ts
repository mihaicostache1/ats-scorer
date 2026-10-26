import type { components } from "@/api/generated/schema";
import { refreshSession } from "@/api/client";
import { env } from "@/env";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

type CvDocumentResponse = components["schemas"]["CvDocumentResponse"];

export type UploadResult =
  | { ok: true; data: CvDocumentResponse }
  | { ok: false; aborted: true }
  | { ok: false; aborted: false; message: string; status: number };

export interface UploadOptions {
  /** Called with 0 to 100 as the file leaves the browser. */
  onProgress?: (percent: number) => void;
  /** Aborting cancels the request in flight. */
  signal?: AbortSignal;
}

type Sent =
  { kind: "done"; status: number; body: unknown } | { kind: "aborted" } | { kind: "network" };

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** One multipart POST. XHR (not fetch) is used because only XHR reports upload progress. */
function send(url: string, file: File, { onProgress, signal }: UploadOptions): Promise<Sent> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ kind: "aborted" });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true; // the session lives in httpOnly cookies

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const finish = (result: Sent) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    xhr.onload = () => finish({ kind: "done", status: xhr.status, body: parse(xhr.responseText) });
    xhr.onabort = () => finish({ kind: "aborted" });
    xhr.onerror = () => finish({ kind: "network" });
    xhr.ontimeout = () => finish({ kind: "network" });

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/**
 * Uploads a CV for a candidate and reports progress. Never throws: the result says whether it
 * worked, was cancelled, or why it failed (in words a person can act on).
 *
 * Going through XHR skips the API client's refresh-and-replay middleware, so a 401 is handled here:
 * refresh the session once and send again.
 */
export async function uploadCandidateCvWithProgress(
  candidateId: string,
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const url = `${env.NEXT_PUBLIC_API_URL}/candidates/${encodeURIComponent(candidateId)}/cv`;

  let sent = await send(url, file, options);
  if (sent.kind === "done" && sent.status === 401 && (await refreshSession())) {
    options.onProgress?.(0);
    sent = await send(url, file, options);
  }

  if (sent.kind === "aborted") return { ok: false, aborted: true };
  if (sent.kind === "network") {
    return { ok: false, aborted: false, message: NETWORK_ERROR_MESSAGE, status: 0 };
  }
  if (sent.status >= 200 && sent.status < 300 && sent.body) {
    return { ok: true, data: sent.body as CvDocumentResponse };
  }
  return {
    ok: false,
    aborted: false,
    message: parseApiFailure(sent.body, sent.status).message,
    status: sent.status,
  };
}
