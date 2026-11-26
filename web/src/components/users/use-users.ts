"use client";

import * as React from "react";
import { listUsers } from "@/api";
import type { components } from "@/api/generated/schema";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

export type UserProfile = components["schemas"]["UserProfileResponse"];
export type UserRole = components["schemas"]["UserRole"];
export type PaginationMeta = components["schemas"]["PaginationMeta"];

export const USER_PAGE_SIZE = 10;

export const ROLE_FILTERS = ["admin", "recruiter", "viewer"] as const satisfies readonly UserRole[];
export const STATUS_FILTERS = ["active", "inactive"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  viewer: "Viewer",
};

export interface UsersQuery {
  q: string;
  role: UserRole | undefined;
  status: StatusFilter | undefined;
  page: number;
}

interface UsersData {
  items: UserProfile[];
  pagination: PaginationMeta;
}

type UsersState =
  | { phase: "loading"; data: null; error: null }
  // `data` is kept while a newer request is in flight so the table doesn't jump.
  | { phase: "success"; data: UsersData; error: null; refreshing: boolean }
  | { phase: "error"; data: null; error: string };

/** Fetches one page of workspace users whenever the query changes; ignores late responses. */
export function useUsers({ q, role, status, page }: UsersQuery) {
  const [state, setState] = React.useState<UsersState>({
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
      let next: UsersState;
      try {
        const { data, error, response } = await listUsers({
          search: q || undefined,
          role,
          is_active: status === undefined ? undefined : status === "active",
          page,
          per_page: USER_PAGE_SIZE,
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
  }, [q, role, status, page, attempt]);

  const refetch = React.useCallback(() => setAttempt((n) => n + 1), []);

  /** Swaps one row for its updated version, e.g. after a role change, without refetching. */
  const replaceUser = React.useCallback((user: UserProfile) => {
    setState((prev) =>
      prev.phase === "success"
        ? {
            ...prev,
            data: {
              ...prev.data,
              items: prev.data.items.map((item) => (item.id === user.id ? user : item)),
            },
          }
        : prev
    );
  }, []);

  return { state, refetch, replaceUser };
}
