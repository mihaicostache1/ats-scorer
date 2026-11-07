import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The internal labeling tool (F-13, /dev/labeling) must not exist in a production build. These tests
 * run against the production build the Playwright config makes (`next build` + `next start`), which
 * is what makes them worth having: the unit tests only check how the pieces are wired.
 */

const NEXT_DIR = path.resolve(process.cwd(), ".next");

/** What a deployment ships: the standalone server, the static assets and the route manifests. */
const SHIPPED = ["standalone", "static", "server"].map((name) => path.join(NEXT_DIR, name));
const MANIFESTS = readdirSync(NEXT_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => path.join(NEXT_DIR, name));

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

const shipped = [...SHIPPED.flatMap(files), ...MANIFESTS];

// Things only the labeling tool contains: its URL, its storage key, its page title and loader.
const NEEDLES = ["/dev/labeling", "ats-scorer:labeling", "Labeling tool", "LabelingDataError"];

test.describe("labeling tool in a production build", () => {
  for (const url of [
    "/dev/labeling",
    "/dev/labeling/",
    "/dev/labeling/pdf/C001",
    "/dev/labeling/pdf/C001.pdf",
    "/dev/labeling/pdf/..%2F..%2Fpairs",
    "/dev/labeling/page.dev",
    "/dev/labeling/pdf/C001/route.dev",
  ]) {
    test(`${url} is a 404`, async ({ request }) => {
      // Redirects are followed: Next sends `/dev/labeling/` to `/dev/labeling`, and what counts is
      // where the visitor ends up.
      const response = await request.get(url);
      expect(response.status()).toBe(404);
      expect(response.headers()["content-type"] ?? "").not.toContain("application/pdf");
    });
  }

  test("a browser gets the not-found page, not the tool", async ({ page }) => {
    const response = await page.goto("/dev/labeling");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Labeling tool")).toHaveCount(0);
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("the scan below looks in the right place: it sees the other dev page that ships", () => {
    // /dev/components is a normal route and is in the build. If this fails, the folders moved and
    // the next tests would pass for the wrong reason.
    expect(shipped.some((file) => file.includes(`${path.sep}dev${path.sep}components`))).toBe(true);
    expect(shipped.length).toBeGreaterThan(50);
    expect(statSync(path.join(NEXT_DIR, "standalone", "server.js")).isFile()).toBe(true);
  });

  test("no file in the build is named after it", () => {
    const named = shipped.filter((file) => /labeling/i.test(path.relative(NEXT_DIR, file)));
    expect(named.map((file) => path.relative(NEXT_DIR, file))).toEqual([]);
  });

  test("nothing in the build contains its code, URL or text", () => {
    const found: string[] = [];
    for (const file of shipped) {
      const content = readFileSync(file);
      for (const needle of NEEDLES) {
        if (content.includes(needle)) found.push(`${path.relative(NEXT_DIR, file)}: ${needle}`);
      }
    }
    expect(found).toEqual([]);
  });

  test("the route manifests do not list it", () => {
    for (const manifest of MANIFESTS.filter((file) => /routes-manifest|app-paths/.test(file))) {
      expect(readFileSync(manifest, "utf8"), path.basename(manifest)).not.toContain("labeling");
    }
  });

  test("the evaluation set is not shipped either: no CV of it is in the standalone build", () => {
    const standalone = files(path.join(NEXT_DIR, "standalone"));
    expect(standalone.filter((file) => /ml[\\/]evaluation/.test(file))).toEqual([]);
    expect(standalone.filter((file) => /[\\/]pdfs[\\/]C\d+\.pdf$/.test(file))).toEqual([]);
  });
});
