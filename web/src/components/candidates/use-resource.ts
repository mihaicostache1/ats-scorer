"use client";

import * as React from "react";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

/** Thrown by `unwrap` when the API answered with an error. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Turns an openapi-fetch result into its data, or throws an `ApiRequestError`. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: { status: number } }): T {
  if (result.data !== undefined) return result.data;
  throw new ApiRequestError(
    parseApiFailure(result.error, result.response.status).message,
    result.response.status
  );
}

export type ResourceState<T> =
  | { phase: "loading" }
  | { phase: "success"; data: T }
  | { phase: "error"; error: string; notFound: boolean };

type Result<T> =
  | { load: unknown; phase: "success"; data: T }
  | { load: unknown; phase: "error"; error: string; notFound: boolean };

/**
 * Runs `load` and tracks its state. Pass a stable function (`useCallback`); a new function means a
 * new request, and answers to an older one are ignored. Several of these on one page fail
 * independently, so one broken section doesn't take the others down.
 */
export function useResource<T>(load: () => Promise<T>) {
  const [result, setResult] = React.useState<Result<T> | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let next: Result<T>;
      try {
        next = { load, phase: "success", data: await load() };
      } catch (err) {
        next =
          err instanceof ApiRequestError
            ? { load, phase: "error", error: err.message, notFound: err.status === 404 }
            : { load, phase: "error", error: NETWORK_ERROR_MESSAGE, notFound: false };
      }
      if (!cancelled) setResult(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const state: ResourceState<T> =
    result && result.load === load
      ? result.phase === "success"
        ? { phase: "success", data: result.data }
        : { phase: "error", error: result.error, notFound: result.notFound }
      : { phase: "loading" };

  const refetch = React.useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  return { state, refetch };
}
