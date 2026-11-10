/**
 * Dev-only routes.
 *
 * A route file named `page.dev.tsx` or `route.dev.ts` is only a route while the dev server runs.
 * Next builds the matcher for its special files from `pageExtensions`, so with these two extensions
 * left out, `next build` and `next start` see them as ordinary files that nothing imports: the route
 * is not compiled, not traced into the standalone output and not served (it answers 404).
 *
 * This file is read by `next.config.ts`, so keep it free of imports.
 */

/** The default extensions Next accepts for page and route files. */
export const DEFAULT_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

/** Extensions that only count while the dev server runs: `page.dev.tsx`, `route.dev.ts`. */
export const DEV_ONLY_PAGE_EXTENSIONS = ["dev.tsx", "dev.ts"];

/** Value of `next/constants`' `PHASE_DEVELOPMENT_SERVER`, spelled out so this file needs no imports. */
export const DEV_SERVER_PHASE = "phase-development-server";

/** `pageExtensions` for a Next phase: dev-only routes are included for the dev server and nothing else. */
export function pageExtensionsFor(phase: string): string[] {
  return phase === DEV_SERVER_PHASE
    ? [...DEFAULT_PAGE_EXTENSIONS, ...DEV_ONLY_PAGE_EXTENSIONS]
    : [...DEFAULT_PAGE_EXTENSIONS];
}
