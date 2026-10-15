"use client";

import * as React from "react";
import { listJobs } from "@/api";
import type { components } from "@/api/generated/schema";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

export type JobResponse = components["schemas"]["JobResponse"];
export type PaginationMeta = components["schemas"]["PaginationMeta"];
export type JobStatus = JobResponse["status"];

export const JOB_PAGE_SIZE = 10;

export interface JobsQuery {
  q: string;
  status: JobStatus | undefined;
  page: number;
}

interface JobsData {
  items: JobResponse[];
  pagination: PaginationMeta;
}

type JobsState =
  | { phase: "loading"; data: null; error: null }
  // `data` is kept while a newer request is in flight so the table doesn't jump.
  | { phase: "success"; data: JobsData; error: null; refreshing: boolean }
  | { phase: "error"; data: null; error: string };

/** Fetches one page of jobs whenever the query changes; ignores responses that arrive late. */
export function useJobs({ q, status, page }: JobsQuery) {
  const [state, setState] = React.useState<JobsState>({
    phase: "loading",
    data: null,
    error: null,
  });
  const [attempt, setAttempt] = React.useState(0);
  const latest = React.useRef(0);

  React.useEffect(() => {
    const requestId = ++latest.current;
    // State is only touched after an await, so changing the query never sets state synchronously
    // inside the effect body.
    const run = async () => {
      let next: JobsState;
      try {
        const { data, error, response } = await listJobs({
          search: q || undefined,
          status,
          page,
          per_page: JOB_PAGE_SIZE,
        });
        next = data
          ? { phase: "success", data, error: null, refreshing: false }
          : { phase: "error", data: null, error: parseApiFailure(error, response.status).message };
      } catch {
        next = { phase: "error", data: null, error: NETWORK_ERROR_MESSAGE };
      }
      if (requestId === latest.current) setState(next);
    };

    // Mark the visible rows as stale right away (as an update to the existing state).
    queueMicrotask(() => {
      if (requestId !== latest.current) return;
      setState((prev) =>
        prev.phase === "success"
          ? { ...prev, refreshing: true }
          : { phase: "loading", data: null, error: null }
      );
    });
    void run();
  }, [q, status, page, attempt]);

  const refetch = React.useCallback(() => setAttempt((n) => n + 1), []);

  return { state, refetch };
}
