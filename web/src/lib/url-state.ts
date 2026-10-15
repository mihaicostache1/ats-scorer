/**
 * Helpers for keeping list state (search, filter, page) in the URL query string,
 * so a page can be refreshed, shared and navigated with Back/Forward.
 */

/** Parses a positive integer query param; anything else (missing, 0, "abc", "2.5") is `fallback`. */
export function parsePositiveInt(value: string | null, fallback = 1): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback;
}

/** Returns `value` if it is one of `allowed`, else `undefined`. */
export function parseOneOf<T extends string>(
  value: string | null,
  allowed: readonly T[]
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

/**
 * Builds `pathname?query` from `params`, leaving out empty values so default state keeps
 * the URL clean (`/jobs` rather than `/jobs?q=&page=1`).
 */
export function buildUrl(
  pathname: string,
  params: Record<string, string | number | undefined>
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
