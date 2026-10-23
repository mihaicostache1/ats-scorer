import { expect, test, type Page } from "@playwright/test";

// Demo account from the MSW fixtures (src/mocks/fixtures/auth.ts).
const RECRUITER = { email: "recruiter@demo.com", password: "DevOnly123!" };

// What happens to an upload is chosen by its file name: see "CV upload scenarios" in web/README.md.
const SLOW_STEP = { timeout: 20_000 };

function pdf(name: string, size = 300) {
  const body = "%PDF-1.4\n" + "x".repeat(size) + "\n%%EOF";
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body) };
}

/** Signs in and opens Priya Nair's profile (she has one CV already). */
async function openProfile(page: Page) {
  await page.goto("/login?next=%2Fjobs");
  await page.getByLabel("Email").fill(RECRUITER.email);
  await page.getByLabel("Password").fill(RECRUITER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("link", { name: "Candidates" }).first().click();
  await page.getByLabel("Search candidates by name or email").fill("priya");
  await page.getByRole("link", { name: "Priya Nair" }).click();
  await expect(page.getByRole("heading", { name: "Priya Nair", level: 1 })).toBeVisible();
  await expect(page.getByText("priya-nair-cv.pdf")).toBeVisible();
}

const cvs = (page: Page) => page.getByRole("region", { name: "CVs" });
const chooseFile = (page: Page, file: ReturnType<typeof pdf>) =>
  page.getByLabel("Choose PDF").setInputFiles(file);
/** The polite live region that announces status changes. */
const liveRegion = (page: Page) => cvs(page).locator('p[aria-live="polite"]');

test("an uploaded CV goes from queued to parsed, with a link to review it", async ({ page }) => {
  await openProfile(page);
  await chooseFile(page, pdf("priya-new.pdf"));

  const row = cvs(page).getByRole("listitem").filter({ hasText: "priya-new.pdf" });
  await expect(row.getByText("Parsed and ready to review.")).toBeVisible(SLOW_STEP);
  await expect(row.getByText("Parse status: Parsed")).toBeVisible();
  await expect(liveRegion(page)).toHaveText("priya-new.pdf: Parsed and ready to review.");

  await row.getByRole("link", { name: "Review priya-new.pdf" }).click();
  await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]+\/cvs\/[0-9a-f-]+\/review$/);
  await expect(page.getByText("CV review is coming soon")).toBeVisible();
});

test("a CV that needs a human check says so", async ({ page }) => {
  await openProfile(page);
  await chooseFile(page, pdf("priya-needs-review.pdf"));

  const row = cvs(page).getByRole("listitem").filter({ hasText: "priya-needs-review.pdf" });
  await expect(row.getByText("Parsed, but some fields need a human check.")).toBeVisible(SLOW_STEP);
  await expect(row.getByRole("link", { name: /^Review/ })).toBeVisible();
});

test("a failed CV can be retried", async ({ page }) => {
  await openProfile(page);
  await chooseFile(page, pdf("priya-fail-then-ok.pdf"));

  const row = cvs(page).getByRole("listitem").filter({ hasText: "priya-fail-then-ok.pdf" });
  await expect(
    row.getByText("An unexpected error occurred during extraction. Gave up after 3 attempts.")
  ).toBeVisible(SLOW_STEP);
  await expect(row.getByText("This is usually temporary. Try again.")).toBeVisible();

  await row.getByRole("button", { name: "Retry priya-fail-then-ok.pdf" }).click();
  await expect(row.getByText("Parsed and ready to review.")).toBeVisible(SLOW_STEP);
});

test("a file problem explains what to do instead of offering a pointless retry", async ({
  page,
}) => {
  await openProfile(page);
  await chooseFile(page, pdf("priya-encrypted.pdf"));

  const row = cvs(page).getByRole("listitem").filter({ hasText: "priya-encrypted.pdf" });
  await expect(row.getByText("The PDF is password-protected and cannot be read.")).toBeVisible(
    SLOW_STEP
  );
  await expect(
    row.getByText("Remove the password protection and upload the file again.")
  ).toBeVisible();
});

test("files that can't be uploaded are refused before they are sent", async ({ page }) => {
  await openProfile(page);

  await chooseFile(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(cvs(page).getByRole("alert")).toHaveText("Only PDF files are accepted.");

  const big = pdf("big.pdf", 10 * 1024 * 1024);
  await chooseFile(page, big);
  await expect(cvs(page).getByRole("alert")).toHaveText("The file is larger than the 10 MB limit.");

  // Nothing was added to the list.
  await expect(cvs(page).getByText("big.pdf")).toHaveCount(0);
});

test("an upload the server refuses shows why and can be tried again", async ({ page }) => {
  await openProfile(page);
  await chooseFile(page, pdf("priya-upload-500.pdf"));

  const item = cvs(page).getByRole("listitem").filter({ hasText: "priya-upload-500.pdf" });
  await expect(item.getByRole("alert")).toHaveText(
    "The server ran into a problem. Please try again shortly."
  );
  await expect(item.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("leaving the page stops the status checks", async ({ page }) => {
  const statusChecks: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      /\/candidates\/[^/]+\/cv\/[0-9a-f-]{36}$/.test(request.url())
    ) {
      statusChecks.push(request.url());
    }
  });

  await openProfile(page);
  await chooseFile(page, pdf("priya-stuck.pdf")); // never leaves the queue

  await expect.poll(() => statusChecks.length, SLOW_STEP).toBeGreaterThanOrEqual(2);

  // Client-side navigation, so the app (not the browser) has to clean up after itself.
  await page.getByRole("link", { name: "Back to candidates" }).click();
  await expect(page.getByRole("heading", { name: "Candidates", level: 1 })).toBeVisible();
  const countOnLeaving = statusChecks.length;

  // Longer than the longest wait between checks at this point (a few seconds).
  await page.waitForTimeout(5000);
  expect(statusChecks.length).toBe(countOnLeaving);
});
