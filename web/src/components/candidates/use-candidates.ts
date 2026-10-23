"use client";

import * as React from "react";
import { listCandidates } from "@/api";
import type { components } from "@/api/generated/schema";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

export type CandidateResponse = components["schemas"]["CandidateResponse"];
export type PaginationMeta = components["schemas"]["PaginationMeta"];

export const CANDIDATE_PAGE_SIZE = 10;

export interface CandidatesQuery {
  q: string;
  page: number;
}

interface CandidatesData {
  items: CandidateResponse[];
  pagination: PaginationMeta;
}

type CandidatesState =
  | { phase: "loading"; data: null; error: null }
  // `data` is kept while a newer request is in flight so the table doesn't jump.
  | { phase: "success"; data: CandidatesData; error: null; refreshing: boolean }
  | { phase: "error"; data: null; error: string };

/** Fetches one page of candidates whenever the query changes; ignores responses that arrive late. */
export function useCandidates({ q, page }: CandidatesQuery) {
  const [state, setState] = React.useState<CandidatesState>({
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
      let next: CandidatesState;
      try {
        const { data, error, response } = await listCandidates({
          search: q || undefined,
          page,
          per_page: CANDIDATE_PAGE_SIZE,
          // A fixed, alphabetical order keeps paging stable.
          sort_by: "full_name",
          sort_order: "asc",
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
  }, [q, page, attempt]);

  const refetch = React.useCallback(() => setAttempt((n) => n + 1), []);

  return { state, refetch };
}
