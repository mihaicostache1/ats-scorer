// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { staggerStyle } from "./motion";

/**
 * The motion system lives in CSS, which Vitest doesn't load (`css: false`), so these tests read
 * `globals.css` as text. They keep the pieces wired together and the reduced-motion promise intact.
 * How it really behaves in a browser is checked in e2e/motion.spec.ts.
 */

const SRC = path.resolve(process.cwd(), "src");
const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");

/** The body of the first block that starts with `opener`, braces balanced. */
function block(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start === -1) throw new Error(`no block starting with ${opener}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(source.indexOf("{", start) + 1, i);
  }
  throw new Error(`unbalanced block ${opener}`);
}

describe("motion tokens", () => {
  it("defines the curves, the durations and the shimmer colour, in light and dark", () => {
    expect(css).toMatch(/--ease-fluid:\s*cubic-bezier\(/);
    expect(css).toMatch(/--ease-pop:\s*cubic-bezier\(/);
    for (const name of ["fast", "base", "slow"]) {
      expect(css).toMatch(new RegExp(`--motion-${name}:\\s*\\d+ms`));
    }
    expect(block(css, ":root {")).toContain("--shimmer:");
    expect(block(css, ".dark {")).toContain("--shimmer:");
  });

  it("keeps the durations short: nothing in the system is slower than 400ms", () => {
    for (const [, ms] of css.matchAll(/--motion-\w+:\s*(\d+)ms/g)) {
      expect(Number(ms)).toBeLessThanOrEqual(400);
    }
  });
});

describe("keyframes and utilities", () => {
  const keyframes = [...css.matchAll(/@keyframes (fluid-[\w-]+)/g)].map((m) => m[1]);

  it("has the five keyframes the components rely on", () => {
    expect(keyframes.sort()).toEqual([
      "fluid-page-in",
      "fluid-pop-in",
      "fluid-row-in",
      "fluid-shimmer",
      "fluid-toast-out",
    ]);
  });

  it("uses every keyframe in a utility, so none is dead", () => {
    for (const name of keyframes) {
      expect(css, name).toMatch(new RegExp(`animation:\\s*${name}\\b`));
    }
  });

  it("only animates opacity, transform and background position", () => {
    for (const name of keyframes) {
      const body = block(css, `@keyframes ${name}`);
      const properties = [...body.matchAll(/([a-z-]+):\s*[^;]+;/g)].map((m) => m[1]);
      for (const property of properties) {
        expect(["opacity", "transform", "background-position"], `${name}: ${property}`).toContain(
          property
        );
      }
    }
  });

  it("leaves nothing behind after an entrance: they fill backwards, not forwards", () => {
    for (const utility of ["animate-page-in", "animate-row-in", "animate-pop-in"]) {
      const body = block(css, `@utility ${utility}`);
      expect(body, utility).toMatch(/\bbackwards\b/);
      expect(body, utility).not.toMatch(/\bforwards\b|\bboth\b/);
    }
  });

  it("staggers rows from --i, capped so a long list does not take long", () => {
    const body = block(css, "@utility animate-row-in");
    expect(body).toMatch(/animation-delay:\s*calc\(min\(var\(--i,\s*0\),\s*10\)\s*\*\s*28ms\)/);
    // The longest wait: ten steps of 28ms, then the 320ms entrance.
    expect(10 * 28 + 320).toBeLessThan(700);
  });

  it("parks the shimmer's highlight out of sight, so it is invisible when motion is reduced", () => {
    const body = block(css, "@utility skeleton-shimmer");
    expect(body).toMatch(/background-position:\s*150%\s*0/);
  });
});

describe("reduced motion", () => {
  const reduce = block(css, "@media (prefers-reduced-motion: reduce)");

  it("makes every animation and transition finish at once, and nothing loop", () => {
    expect(reduce).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reduce).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(reduce).toMatch(/animation-delay:\s*0ms\s*!important/);
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reduce).toMatch(/transition-delay:\s*0ms\s*!important/);
    expect(reduce).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("applies to everything, including pseudo-elements", () => {
    expect(reduce).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/);
  });

  it("keeps the loading spinner turning: it is feedback, not decoration", () => {
    const spinner = block(reduce, ".animate-spin");
    expect(spinner).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
  });

  it("is the only reduced-motion rule, so nothing undoes it", () => {
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
  });

  it("limits the lift on clickable surfaces to users who have not asked for less motion", () => {
    const interactive = block(css, "@utility interactive");
    expect(interactive).toMatch(/prefers-reduced-motion:\s*no-preference/);
    expect(interactive).toMatch(/hover:\s*hover/);
  });
});

describe("no hover or press movement without motion-safe", () => {
  // A scale or a shift on hover or press is motion. Colour and shadow changes are fine; movement has
  // to be wrapped in `motion-safe:` so people who asked for less motion don't get a jump.
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "dev" ? [] : files(full);
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
    });
  }

  it("finds none in the components or the app", () => {
    const offenders: string[] = [];
    for (const file of [...files(path.join(SRC, "components")), ...files(path.join(SRC, "app"))]) {
      const source = readFileSync(file, "utf8");
      for (const [token] of source.matchAll(
        /[^\s"'`]*(?:hover|active|group-hover):[^\s"'`]*(?:scale|translate)-[^\s"'`]*/g
      )) {
        if (!token.startsWith("motion-safe:")) {
          offenders.push(`${path.relative(SRC, file)}: ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("staggerStyle", () => {
  it("passes the index as --i", () => {
    expect(staggerStyle(3)).toEqual({ "--i": 3 });
  });

  it("never gives a negative or fractional step", () => {
    expect(staggerStyle(-2)).toEqual({ "--i": 0 });
    expect(staggerStyle(2.9)).toEqual({ "--i": 2 });
  });
});
