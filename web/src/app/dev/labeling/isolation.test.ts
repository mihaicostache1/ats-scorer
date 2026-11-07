// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards that keep the labeling tool out of production builds. The main lock is `pageExtensions`
 * (src/lib/dev-routes.ts); these tests catch the ways someone could undo it by accident, long before a
 * production build would. The real build is checked in e2e/dev-routes.spec.ts.
 */

const SRC = path.resolve(process.cwd(), "src");
const TOOL = path.join(SRC, "app", "dev", "labeling");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const rel = (file: string) => path.relative(process.cwd(), file).split(path.sep).join("/");
const sourceFiles = (files: string[]) =>
  files.filter((file) => /\.(tsx?|jsx?|mts|mjs)$/.test(file));

/** File names Next treats as part of the route tree, which would make a folder reachable. */
const ROUTE_FILE =
  /^(page|route|layout|template|loading|error|global-error|not-found|default|forbidden|unauthorized|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.(tsx?|jsx?|js|ts)$/;

describe("the labeling tool is isolated", () => {
  const toolFiles = walk(TOOL);

  it("is only reachable through `.dev` route files", () => {
    const routes = toolFiles
      .map((file) => path.basename(file))
      .filter((name) => ROUTE_FILE.test(name));
    // A plain `page.tsx` or `route.ts` here would be a route in production too.
    expect(routes).toEqual([]);

    const dev = toolFiles.map(rel).filter((file) => /\/(page|route)\.dev\.tsx?$/.test(file));
    expect(dev.sort()).toEqual([
      "src/app/dev/labeling/page.dev.tsx",
      "src/app/dev/labeling/pdf/[id]/route.dev.ts",
    ]);
  });

  it("has no layout, template or metadata file that would apply to other routes", () => {
    const names = readdirSync(path.join(SRC, "app", "dev"));
    expect(names.filter((name) => ROUTE_FILE.test(name))).toEqual([]);
  });

  it("is not imported from anywhere outside its folder", () => {
    const importOfTool = /(?:from|import)\s*\(?\s*["'][^"']*dev\/labeling[^"']*["']/;
    const offenders = sourceFiles(walk(SRC))
      .filter((file) => !file.startsWith(TOOL + path.sep))
      .filter((file) => importOfTool.test(readFileSync(file, "utf8")))
      .map(rel);
    // An import from production code would pull the tool, and its file reads, into the bundle.
    expect(offenders).toEqual([]);
  });

  it("is not linked from the app", () => {
    const links = sourceFiles(walk(SRC))
      .filter((file) => !file.startsWith(TOOL + path.sep))
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => /["'`]\/dev\/labeling/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(links).toEqual([]);
  });

  it("does not use route-typed helpers, which do not exist for a route a build leaves out", () => {
    const offenders = sourceFiles(toolFiles)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => /\b(PageProps|RouteContext|LayoutProps)</.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("locks both route files a second time, for when the first lock is ever removed", () => {
    for (const file of ["page.dev.tsx", path.join("pdf", "[id]", "route.dev.ts")]) {
      const source = readFileSync(path.join(TOOL, file), "utf8");
      expect(source, file).toMatch(/process\.env\.NODE_ENV === "production"/);
    }
  });

  it("keeps everything that reads files in the folder, and no file is a client component that reads them", () => {
    const data = readFileSync(path.join(TOOL, "_lib", "data.ts"), "utf8");
    expect(data).toContain('from "node:fs/promises"');
    for (const file of sourceFiles(toolFiles).filter((f) => rel(f).includes("/_components/"))) {
      expect(readFileSync(file, "utf8"), rel(file)).not.toMatch(/node:fs|from "\.\.\/_lib\/data"/);
    }
  });
});
