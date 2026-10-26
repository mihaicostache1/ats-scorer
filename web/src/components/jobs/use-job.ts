"use client";

import * as React from "react";
import { getJob } from "@/api";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import type { JobResponse } from "./use-jobs";

type JobResult =
  | { id: string; phase: "success"; job: JobResponse }
  | { id: string; phase: "error"; error: string; notFound: boolean };

export type JobState =
  | { phase: "loading" }
  | { phase: "success"; job: JobResponse }
  | { phase: "error"; error: string; notFound: boolean };

/** Fetches one job; `setJob` swaps in a fresh copy (e.g. from a status change) without refetching. */
export function useJob(id: string) {
  const [result, setResult] = React.useState<JobResult | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let next: JobResult;
      try {
        const { data, error, response } = await getJob(id);
        next = data
          ? { id, phase: "success", job: data }
          : {
              id,
              phase: "error",
              error: parseApiFailure(error, response.status).message,
              notFound: response.status === 404,
            };
      } catch {
        next = { id, phase: "error", error: NETWORK_ERROR_MESSAGE, notFound: false };
      }
      if (!cancelled) setResult(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  // A result for another id (route change) counts as loading.
  const state: JobState = result && result.id === id ? result : { phase: "loading" };

  const refetch = React.useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);
  const setJob = React.useCallback(
    (job: JobResponse) => setResult({ id: job.id, phase: "success", job }),
    []
  );

  return { state, refetch, setJob };
}
