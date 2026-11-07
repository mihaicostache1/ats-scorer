// @vitest-environment node
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_TEST,
} from "next/constants";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import {
  DEFAULT_PAGE_EXTENSIONS,
  DEV_ONLY_PAGE_EXTENSIONS,
  DEV_SERVER_PHASE,
  pageExtensionsFor,
} from "./dev-routes";

describe("pageExtensionsFor", () => {
  it("uses the phase name Next really has for the dev server", () => {
    // dev-routes.ts spells it out to stay import-free; this keeps it from drifting.
    expect(DEV_SERVER_PHASE).toBe(PHASE_DEVELOPMENT_SERVER);
  });

  it("turns dev-only routes on for the dev server and nothing else", () => {
    const dev = pageExtensionsFor(PHASE_DEVELOPMENT_SERVER);
    for (const extension of DEV_ONLY_PAGE_EXTENSIONS) expect(dev).toContain(extension);
    for (const extension of DEFAULT_PAGE_EXTENSIONS) expect(dev).toContain(extension);
  });

  it.each([
    ["next build", PHASE_PRODUCTION_BUILD],
    ["next start", PHASE_PRODUCTION_SERVER],
    ["next export", PHASE_EXPORT],
    ["a test run", PHASE_TEST],
    ["an unknown phase", "phase-something-new"],
    ["an empty phase", ""],
  ])("leaves dev-only routes out for %s", (_name, phase) => {
    const extensions = pageExtensionsFor(phase);
    expect(extensions).toEqual(DEFAULT_PAGE_EXTENSIONS);
    expect(extensions.some((extension) => extension.startsWith("dev."))).toBe(false);
  });

  it("returns a fresh list, so a caller cannot change the defaults", () => {
    pageExtensionsFor(PHASE_PRODUCTION_BUILD).push("dev.tsx");
    expect(pageExtensionsFor(PHASE_PRODUCTION_BUILD)).toEqual(DEFAULT_PAGE_EXTENSIONS);
  });

  it("makes a `page.dev.tsx` file match Next's page pattern only in dev", () => {
    // How Next builds the matcher (build/index.js): `^page\.(?:ext|ext)$`.
    const matches = (phase: string, file: string) =>
      new RegExp(`^(page|route)\\.(?:${pageExtensionsFor(phase).join("|")})$`).test(file);

    expect(matches(PHASE_DEVELOPMENT_SERVER, "page.dev.tsx")).toBe(true);
    expect(matches(PHASE_DEVELOPMENT_SERVER, "route.dev.ts")).toBe(true);
    expect(matches(PHASE_DEVELOPMENT_SERVER, "page.tsx")).toBe(true);
    expect(matches(PHASE_PRODUCTION_BUILD, "page.dev.tsx")).toBe(false);
    expect(matches(PHASE_PRODUCTION_BUILD, "route.dev.ts")).toBe(false);
    expect(matches(PHASE_PRODUCTION_BUILD, "page.tsx")).toBe(true);
    expect(matches(PHASE_PRODUCTION_SERVER, "page.dev.tsx")).toBe(false);
  });
});

describe("next.config.ts", () => {
  it("is wired to it: dev routes in `next dev`, none in a build or a start", () => {
    expect(nextConfig(PHASE_DEVELOPMENT_SERVER).pageExtensions).toContain("dev.tsx");
    expect(nextConfig(PHASE_PRODUCTION_BUILD).pageExtensions).toEqual(DEFAULT_PAGE_EXTENSIONS);
    expect(nextConfig(PHASE_PRODUCTION_SERVER).pageExtensions).toEqual(DEFAULT_PAGE_EXTENSIONS);
  });

  it("keeps the rest of the configuration in every phase", () => {
    for (const phase of [PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD]) {
      const config = nextConfig(phase);
      expect(config.output).toBe("standalone");
      expect(config.turbopack?.resolveAlias).toHaveProperty("msw/browser");
    }
  });
});
