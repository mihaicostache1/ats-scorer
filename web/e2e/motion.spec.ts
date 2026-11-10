import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The motion pass, in a real browser against the production build. jsdom has no CSS, so this is the
 * only place the transitions can be seen to run (or, with "reduce motion" on, to be switched off).
 *
 * Nothing here sleeps: the page records animation events and attribute changes as they happen, and
 * the tests wait for those.
 */

const ADMIN = { email: "admin@demo.com", password: "DevOnly123!" };

/**
 * Holds every candidates request for a moment inside the page, before it reaches the mock API. The
 * mock answers after 300ms, which is too tight to observe reliably when several tests run at once;
 * this makes the loading state last long enough to be seen, without changing what is being tested.
 */
async function holdCandidates(page: Page, ms = 800) {
  await page.addInitScript((delay) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
      if (method === "GET" && /\/candidates(\?|$)/.test(url)) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return realFetch(input, init);
    };
  }, ms);
}

async function signIn(page: Page) {
  await page.goto("/login?next=%2Fjobs");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs Postings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New job" })).toBeVisible();
  // Wait for the jobs list too: its placeholders and rows animate, and must not leak into a test.
  await expect(page.getByText(/Showing 1 – 10 of \d+ jobs/)).toBeVisible();
}

interface Recorded {
  started: string[];
  ended: string[];
  /** Attributes Base UI puts on a popup for the first and the last frame of its transition. */
  startingStyleSeen: boolean;
  endingStyleSeen: boolean;
  /** The computed animation of the first loading placeholder that ever showed up. */
  skeleton: { name: string; iterations: string } | null;
}
type MotionWindow = Window & { __rec: Recorded };

/** Starts recording, in the page, everything the checks below need. Survives client navigation. */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as MotionWindow;
    w.__rec = {
      started: [],
      ended: [],
      startingStyleSeen: false,
      endingStyleSeen: false,
      skeleton: null,
    };
    addEventListener(
      "animationstart",
      (e) => w.__rec.started.push((e as AnimationEvent).animationName),
      true
    );
    addEventListener(
      "animationend",
      (e) => w.__rec.ended.push((e as AnimationEvent).animationName),
      true
    );
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          // The first frame is an attribute that gets *removed* (the popup is inserted with it), the
          // last frame is one that gets *added*; `oldValue` is how a removal is told from the rest.
          if (m.attributeName === "data-starting-style" && m.oldValue !== null) {
            w.__rec.startingStyleSeen = true;
          }
          if (
            m.attributeName === "data-ending-style" &&
            (m.target as Element).hasAttribute("data-ending-style")
          ) {
            w.__rec.endingStyleSeen = true;
          }
        } else {
          for (const node of m.addedNodes) {
            if (
              node instanceof Element &&
              (node.matches("[data-starting-style]") || node.querySelector("[data-starting-style]"))
            ) {
              w.__rec.startingStyleSeen = true;
            }
          }
        }
      }
      const placeholder = document.querySelector(".skeleton-shimmer");
      if (placeholder && !w.__rec.skeleton) {
        const style = getComputedStyle(placeholder);
        w.__rec.skeleton = { name: style.animationName, iterations: style.animationIterationCount };
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-starting-style", "data-ending-style"],
    });
  });
}

const recorded = <K extends keyof Recorded>(page: Page, key: K) =>
  page.evaluate((k) => (window as unknown as MotionWindow).__rec[k], key);

const countOf = async (page: Page, name: string) =>
  (await recorded(page, "started")).filter((n) => n === name).length;

/** A computed style of an element, read in the page. */
const styleOf = (locator: Locator, property: string) =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

const seconds = (value: string) => Number.parseFloat(value);
const pageWrapper = (page: Page) => page.locator("main > div:visible").first();
/** Rows of the page on screen. Next keeps earlier routes mounted but hidden, so scope to the wrapper. */
const visibleRows = (page: Page) => pageWrapper(page).locator("tbody tr");

/**
 * The computed animation of each row on screen, once the browser has styled them. (Chrome answers
 * with empty strings for an element it has not styled yet, so wait for real values.)
 */
async function rowAnimations(page: Page) {
  let rows: { delay: string; duration: string; opacity: string }[] = [];
  await expect
    .poll(async () => {
      rows = await visibleRows(page).evaluateAll((all) =>
        all.map((row) => {
          const style = getComputedStyle(row);
          return {
            delay: style.animationDelay,
            duration: style.animationDuration,
            opacity: style.opacity,
          };
        })
      );
      return rows.length === 10 && rows.every((r) => r.delay !== "" && r.duration !== "");
    })
    .toBe(true);
  return rows;
}

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first();

test.describe("with motion", () => {
  test("a page fades and rises in on navigation, and ends up at rest", async ({ page }) => {
    await signIn(page);
    await record(page);

    await nav(page, "Candidates").click();
    await expect(page.getByRole("heading", { name: "Candidates", level: 1 })).toBeVisible();

    await expect.poll(() => countOf(page, "fluid-page-in")).toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => (await recorded(page, "ended")).includes("fluid-page-in"))
      .toBe(true);

    // Nothing is left behind once it has finished: fully opaque, and no transform.
    const wrapper = pageWrapper(page);
    await expect.poll(() => styleOf(wrapper, "opacity")).toBe("1");
    expect(await styleOf(wrapper, "transform")).toBe("none");
    expect(await styleOf(wrapper, "animation-name")).toBe("fluid-page-in");
    expect(seconds(await styleOf(wrapper, "animation-duration"))).toBeCloseTo(0.32, 2);
  });

  test("searching a list does not replay the page transition", async ({ page }) => {
    await signIn(page);
    await nav(page, "Candidates").click();
    await expect(page.getByRole("heading", { name: "Candidates", level: 1 })).toBeVisible();
    await expect(page.getByText(/Showing 1 – 10 of \d+ candidates/)).toBeVisible();
    await record(page);

    await page.getByLabel("Search candidates by name or email").fill("priya");
    await expect(page).toHaveURL(/[?&]q=priya/);
    await expect(page.getByText(/of 1 candidate$/)).toBeVisible();

    // Only the search params changed, so the page wrapper is not created again.
    expect(await countOf(page, "fluid-page-in")).toBe(0);
  });

  test("rows come in one after another when the data replaces the placeholders", async ({
    page,
  }) => {
    await signIn(page);
    await record(page);
    await nav(page, "Candidates").click();

    await expect(page.getByText(/Showing 1 – 10 of \d+ candidates/)).toBeVisible();
    await expect.poll(() => countOf(page, "fluid-row-in")).toBeGreaterThanOrEqual(10);

    const rows = await rowAnimations(page);
    rows.forEach(({ delay }, index) => expect(seconds(delay)).toBeCloseTo(index * 0.028, 3));

    // And they all end up fully visible.
    await expect
      .poll(async () => (await rowAnimations(page)).every((row) => row.opacity === "1"))
      .toBe(true);
  });

  test("placeholders shimmer while data loads", async ({ page }) => {
    await holdCandidates(page);
    await signIn(page);
    await record(page);
    await nav(page, "Candidates").click();
    await expect(page.getByText(/Showing 1 – 10 of \d+ candidates/)).toBeVisible();

    expect(await recorded(page, "skeleton")).toEqual({
      name: "fluid-shimmer",
      iterations: "infinite",
    });
  });

  test("a primary button grows a little under the pointer, and settles back", async ({ page }) => {
    await signIn(page);
    const button = page.getByRole("link", { name: "New job" });

    expect(await styleOf(button, "scale")).toBe("none");
    await button.hover();
    await expect.poll(() => styleOf(button, "scale")).toMatch(/^1\.02/);

    await page.mouse.move(2, 2);
    await expect.poll(() => styleOf(button, "scale")).toBe("none");
  });

  test("a sidebar item nudges toward the pointer", async ({ page }) => {
    await signIn(page);
    const item = page
      .getByRole("link", { name: "Candidates", exact: true })
      .first()
      .locator("div")
      .first();

    await item.hover();
    await expect.poll(() => styleOf(item, "translate")).not.toBe("none");
  });

  test("the theme menu expands and collapses with its transition hooks", async ({ page }) => {
    await signIn(page);
    await record(page);

    await page.getByRole("button", { name: "Theme" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Base UI switches transitions off for the very first frame (so the starting style is applied
    // without animating), then back on. Wait for that rather than reading it too early.
    await expect.poll(() => styleOf(menu, "transition-property")).toContain("opacity");
    // It grows from the button that opened it, not from its own centre.
    await expect.poll(() => styleOf(menu, "transform-origin")).not.toMatch(/^(50%|0px) 0px$/);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    expect(await recorded(page, "startingStyleSeen")).toBe(true);
    expect(await recorded(page, "endingStyleSeen")).toBe(true);
  });

  test("a dialog fades and scales in and out, and a toast slides away", async ({ page }) => {
    await signIn(page);
    await page
      .getByRole("link", { name: /Senior Backend Engineer/ })
      .first()
      .click();
    await expect(page.getByRole("button", { name: "Close job" })).toBeVisible();
    await record(page);

    await page.getByRole("button", { name: "Close job" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => styleOf(dialog, "transition-property")).toContain("opacity");
    await expect.poll(() => styleOf(dialog, "transition-property")).toContain("scale");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    // Base UI really ran the transition: it marked the first and the last frame.
    expect(await recorded(page, "startingStyleSeen")).toBe(true);
    expect(await recorded(page, "endingStyleSeen")).toBe(true);

    // Confirming the action raises a toast, which slides in and, once dismissed, away.
    await page.getByRole("button", { name: "Close job" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close job" }).click();
    const toast = page.getByLabel("Notifications").getByRole("alert");
    await expect(toast).toBeVisible();
    expect(await countOf(page, "enter")).toBeGreaterThanOrEqual(1);

    await toast.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast).toHaveAttribute("data-leaving", "");
    expect(await styleOf(toast, "animation-name")).toBe("fluid-toast-out");
    await expect(toast).toBeHidden();
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a page appears in place: its entrance lasts no time at all", async ({ page }) => {
    await signIn(page);
    await nav(page, "Candidates").click();
    await expect(page.getByRole("heading", { name: "Candidates", level: 1 })).toBeVisible();

    const wrapper = pageWrapper(page);
    expect(seconds(await styleOf(wrapper, "animation-duration"))).toBeLessThan(0.001);
    await expect.poll(() => styleOf(wrapper, "opacity")).toBe("1");
  });

  test("rows no longer wait their turn, and placeholders stand still", async ({ page }) => {
    await holdCandidates(page);
    await signIn(page);
    await record(page);
    await nav(page, "Candidates").click();
    await expect(page.getByText(/Showing 1 – 10 of \d+ candidates/)).toBeVisible();

    const rows = await rowAnimations(page);
    for (const { delay, duration } of rows) {
      expect(seconds(delay), `rows: ${JSON.stringify(rows)}`).toBe(0);
      expect(seconds(duration), `rows: ${JSON.stringify(rows)}`).toBeLessThan(0.001);
    }

    const skeleton = await recorded(page, "skeleton");
    expect(skeleton?.iterations).toBe("1");
  });

  test("buttons and sidebar items do not move under the pointer", async ({ page }) => {
    await signIn(page);
    const button = page.getByRole("link", { name: "New job" });
    await button.hover();
    // Give a transition the time it would have needed, so "none" means "never", not "not yet".
    await page.waitForTimeout(400);
    expect(await styleOf(button, "scale")).toBe("none");

    const item = page
      .getByRole("link", { name: "Candidates", exact: true })
      .first()
      .locator("div")
      .first();
    await item.hover();
    await page.waitForTimeout(400);
    expect(await styleOf(item, "translate")).toBe("none");
  });

  test("a loading spinner still turns: it is feedback, not decoration", async ({ page }) => {
    await signIn(page);
    const spinner = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "animate-spin";
      document.body.append(probe);
      const style = getComputedStyle(probe);
      return { iterations: style.animationIterationCount, duration: style.animationDuration };
    });
    expect(spinner.iterations).toBe("infinite");
    expect(seconds(spinner.duration)).toBeCloseTo(1, 1);
  });

  test("dialogs and toasts still open and close promptly", async ({ page }) => {
    await signIn(page);
    await page
      .getByRole("link", { name: /Senior Backend Engineer/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Close job" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close job" }).click();
    await expect(dialog).toBeHidden();

    const toast = page.getByLabel("Notifications").getByRole("alert");
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast).toBeHidden();
  });
});
