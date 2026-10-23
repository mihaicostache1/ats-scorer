import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import { env } from "@/env";

/**
 * Auth uses httpOnly cookies set by the API (B-5): the browser attaches them via
 * `credentials: "include"` and no token is ever readable from, or stored by, JavaScript.
 */

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Subscribe to "the session is gone" events (refresh failed). Returns an unsubscribe fn. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** Requests that must never trigger a refresh-and-retry. */
const isAuthPath = (schemaPath: string) => schemaPath.startsWith("/auth/");

/** Clones of in-flight requests, kept so a request can be replayed after a refresh. */
const pending = new Map<string, Request>();

let refreshing: Promise<boolean> | null = null;

/** Refreshes the session once, however many requests hit a 401 at the same time. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * On a 401 from a non-auth endpoint, tries the refresh cookie once and replays the request.
 * If the refresh fails the session is over and listeners are notified.
 */
const refreshMiddleware: Middleware = {
  onRequest({ request, id, schemaPath }) {
    if (!isAuthPath(schemaPath)) pending.set(id, request.clone());
    return request;
  },
  async onResponse({ response, id, schemaPath }) {
    const original = pending.get(id);
    pending.delete(id);
    if (response.status !== 401 || !original || isAuthPath(schemaPath)) return response;

    if (await refreshSession()) return fetch(original);

    unauthorizedListeners.forEach((listener) => listener());
    return response;
  },
  onError({ id }) {
    pending.delete(id);
  },
};

/**
 * The shared openapi-fetch client typed against the generated OpenAPI schema.
 *
 * Usage:
 * ```ts
 * import { apiClient } from "@/api/client";
 * const { data, error } = await apiClient.GET("/jobs", { params: { query: { page: 1 } } });
 * ```
 */
export const apiClient = createClient<paths>({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  credentials: "include",
});

apiClient.use(refreshMiddleware);
