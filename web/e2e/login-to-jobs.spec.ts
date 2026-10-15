import { expect, test } from "@playwright/test";

// Demo account from the MSW fixtures (src/mocks/fixtures/auth.ts).
const ADMIN = { email: "admin@demo.com", password: "DevOnly123!" };

test("signed-out visitor logs in and browses the jobs list", async ({ page }) => {
  await test.step("a signed-out visit to /jobs is sent to the login page", async () => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/login\?next=%2Fjobs$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  await test.step("a wrong password shows a clear error and stays on the login page", async () => {
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Next.js has its own (empty) role="alert" route announcer, so match on the text.
    await expect(
      page.getByRole("alert").filter({ hasText: "Incorrect email or password" })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  await test.step("valid credentials land on the page that was asked for", async () => {
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("heading", { name: "Jobs Postings" })).toBeVisible();
    await expect(page.getByText("Showing 1 – 10 of 25 jobs")).toBeVisible();
    await expect(page.getByRole("link", { name: "New job" })).toBeVisible();
  });

  await test.step("searching narrows the list and is kept in the URL", async () => {
    await page.getByLabel("Search jobs by title or department").fill("designer");

    await expect(page).toHaveURL(/[?&]q=designer/);
    await expect(page.getByText(/of 2 jobs$/)).toBeVisible();
    await expect(page.getByRole("cell", { name: /Product Designer/ })).toBeVisible();

    await page.getByLabel("Search jobs by title or department").clear();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByText("Showing 1 – 10 of 25 jobs")).toBeVisible();
  });

  await test.step("paging updates the list and the URL", async () => {
    await page.getByRole("button", { name: "Next page" }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByText("Showing 11 – 20 of 25 jobs")).toBeVisible();
  });

  await test.step("the session and the page survive a reload", async () => {
    await page.reload();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByRole("heading", { name: "Jobs Postings" })).toBeVisible();
    await expect(page.getByText("Showing 11 – 20 of 25 jobs")).toBeVisible();
  });
});
