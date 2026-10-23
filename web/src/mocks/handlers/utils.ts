import { delay, HttpResponse } from "msw";
import type { components } from "@/api/generated/schema";

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];

/** Builds an `ErrorEnvelope` response matching the shape documented in the OpenAPI spec. */
export function errorResponse(status: number, code: string, message: string): Response {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      request_id: `req_${Date.now()}`,
    },
  };
  return HttpResponse.json(body, { status });
}

/** Simulated latency so loading states are visible; skipped under Vitest so tests stay fast. */
export const wait = (ms: number) => delay(process.env.NODE_ENV === "test" ? 0 : ms);

/** FastAPI's own error body, `{ detail }`, which is what the CV routes really return. */
export function detailResponse(status: number, message: string): Response {
  return HttpResponse.json({ detail: message }, { status });
}

export function notFound(resource: string, id: unknown): Response {
  return errorResponse(404, "RESOURCE_NOT_FOUND", `${resource} with ID '${id}' was not found.`);
}

/** Slices `items` for the requested page and builds the `PaginationMeta` block. */
export function paginate<T>(items: T[], url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 20)));
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    pagination: {
      page,
      per_page: perPage,
      total_items: items.length,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}

/** Sorts a copy of `items` by `sort_by` / `sort_order` query params (string/number fields only). */
export function sortItems<T extends object>(items: T[], url: URL, fallback: keyof T & string): T[] {
  const sortBy = (url.searchParams.get("sort_by") ?? fallback) as keyof T;
  const dir = url.searchParams.get("sort_order") === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = String(a[sortBy] ?? "").toLowerCase();
    const y = String(b[sortBy] ?? "").toLowerCase();
    return x < y ? -dir : x > y ? dir : 0;
  });
}
