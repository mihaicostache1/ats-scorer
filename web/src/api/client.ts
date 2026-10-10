import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import { env } from "@/env";

/** Bearer token storage key (localStorage). */
export const TOKEN_KEY = "ats_token";

/**
 * Middleware that reads the JWT from localStorage and attaches it as a
 * `Authorization: Bearer <token>` header on every request.
 * No-ops on the server (localStorage is undefined).
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (typeof localStorage === "undefined") return request;
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
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
});

apiClient.use(authMiddleware);
