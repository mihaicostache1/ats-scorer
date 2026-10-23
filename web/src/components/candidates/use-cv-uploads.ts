"use client";

import * as React from "react";
import { uploadCandidateCvWithProgress } from "@/api/upload-cv";
import { describeCvStatus, type CvDocument } from "./cv-status";

export interface PendingUpload {
  key: string;
  file: File;
  phase: "uploading" | "error";
  /** 0 to 100 while uploading. */
  progress: number;
  /** Why it failed, when `phase` is "error". */
  message?: string;
}

/**
 * Uploads a candidate's CVs one request at a time per file and tracks each until the server has
 * accepted it. Leaving the page cancels whatever is still being sent.
 */
export function useCvUploads({
  candidateId,
  onUploaded,
  announce,
}: {
  candidateId: string;
  /** The server accepted the file; the document starts its processing here. */
  onUploaded: (cv: CvDocument) => void;
  announce: (message: string) => void;
}) {
  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const controllers = React.useRef(new Map<string, AbortController>());

  const patch = React.useCallback((key: string, change: Partial<PendingUpload>) => {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
  }, []);
  const remove = React.useCallback((key: string) => {
    setPending((list) => list.filter((p) => p.key !== key));
  }, []);

  const run = React.useCallback(
    async (key: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(key, controller);
      patch(key, { phase: "uploading", progress: 0, message: undefined });

      const result = await uploadCandidateCvWithProgress(candidateId, file, {
        signal: controller.signal,
        onProgress: (progress) => patch(key, { progress }),
      });
      controllers.current.delete(key);

      if (result.ok) {
        remove(key);
        onUploaded(result.data);
        announce(`${file.name} uploaded. ${describeCvStatus(result.data)}`);
      } else if (result.aborted) {
        remove(key);
      } else {
        // Shown in an alert next to the file, which screen readers announce on its own.
        patch(key, { phase: "error", message: result.message });
      }
    },
    [candidateId, patch, remove, onUploaded, announce]
  );

  const start = React.useCallback(
    (file: File) => {
      const key = crypto.randomUUID();
      setPending((list) => [{ key, file, phase: "uploading", progress: 0 }, ...list]);
      announce(`Uploading ${file.name}`);
      void run(key, file);
    },
    [run, announce]
  );

  const retry = React.useCallback(
    (key: string) => {
      const item = pending.find((p) => p.key === key);
      if (item) void run(key, item.file);
    },
    [pending, run]
  );

  const cancel = React.useCallback(
    (key: string) => {
      const controller = controllers.current.get(key);
      if (controller) {
        controller.abort();
        announce("Upload cancelled");
      } else {
        remove(key);
      }
    },
    [remove, announce]
  );

  // Leaving the page: stop sending files.
  React.useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, []);

  return { pending, start, retry, cancel, dismiss: remove };
}
