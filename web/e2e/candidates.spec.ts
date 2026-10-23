import { expect, test } from "@playwright/test";

// Demo account from the MSW fixtures (src/mocks/fixtures/auth.ts).
const ADMIN = { email: "admin@demo.com", password: "DevOnly123!" };

test("browse, search and page the candidates list, then open a profile", async ({ page }) => {
  await test.step("sign in and open Candidates from the navigation", async () => {
    await page.goto("/login?next=%2Fjobs");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("link", { name: "Candidates" }).first().click();
    await expect(page).toHaveURL(/\/candidates$/);
    await expect(page.getByRole("heading", { name: "Candidates", level: 1 })).toBeVisible();
    await expect(page.getByText("Showing 1 – 10 of 25 candidates")).toBeVisible();
  });

  await test.step("paging updates the list and the URL", async () => {
    await page.getByRole("button", { name: "Next page" }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByText("Showing 11 – 20 of 25 candidates")).toBeVisible();
  });

  await test.step("the page survives a reload", async () => {
    await page.reload();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByText("Showing 11 – 20 of 25 candidates")).toBeVisible();
  });

  await test.step("searching narrows the list, resets the page and is kept in the URL", async () => {
    await page.getByLabel("Search candidates by name or email").fill("priya");

    await expect(page).toHaveURL(/[?&]q=priya/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText(/of 1 candidate$/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Priya Nair" })).toBeVisible();
  });

  await test.step("a search with no matches shows the empty state, which can be cleared", async () => {
    await page.getByLabel("Search candidates by name or email").fill("zzzzzz");
    await expect(page.getByText("No candidates match your search")).toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page).toHaveURL(/\/candidates$/);
    await expect(page.getByText("Showing 1 – 10 of 25 candidates")).toBeVisible();
  });

  await test.step("a profile shows contact, applications, CVs and the parsed summary", async () => {
    await page.getByLabel("Search candidates by name or email").fill("priya");
    await page.getByRole("link", { name: "Priya Nair" }).click();

    await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Priya Nair", level: 1 })).toBeVisible();

    const contact = page.getByRole("region", { name: "Contact" });
    await expect(contact.getByRole("link", { name: /priya\.nair@example\.com/ })).toBeVisible();

    const applications = page.getByRole("region", { name: "Applications" });
    await expect(applications.getByRole("link").first()).toBeVisible();

    const cvs = page.getByRole("region", { name: "CVs" });
    await expect(cvs.getByText("priya-nair-cv.pdf")).toBeVisible();
    await expect(cvs.getByText(/Parse status:\s*Parsed/)).toBeVisible();

    const parsed = page.getByRole("region", { name: "Parsed summary" });
    await expect(parsed.getByText("TypeScript")).toBeVisible();
  });

  await test.step("Back returns to the search that was open", async () => {
    await page.goBack();
    await expect(page).toHaveURL(/[?&]q=priya/);
    await expect(page.getByLabel("Search candidates by name or email")).toHaveValue("priya");
  });
});

test("a candidate that is not parsed or has no CV says so", async ({ page }) => {
  await page.goto("/login?next=%2Fjobs");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("link", { name: "Candidates" }).first().click();
  await page.getByLabel("Search candidates by name or email").fill("emilia");
  await page.getByRole("link", { name: "Emilia Santos" }).click();

  await expect(page.getByRole("heading", { name: "Emilia Santos", level: 1 })).toBeVisible();
  await expect(page.getByText("No CVs uploaded yet.")).toBeVisible();
  await expect(page.getByText(/Not parsed yet/)).toBeVisible();
  await expect(page.getByText("Not applied to any job yet.")).toBeVisible();
});

test("an unknown candidate id shows a not-found state", async ({ page }) => {
  await page.goto("/login?next=%2Fcandidates%2F00000000-0000-4000-8000-000000000000");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Candidate not found")).toBeVisible();
});

test("a viewer has no Candidates link and is blocked from the pages", async ({ page }) => {
  await page.goto("/login?next=%2Fjobs");
  await page.getByLabel("Email").fill("viewer@demo.com");
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Jobs Postings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Candidates" })).toHaveCount(0);

  // Typing the address doesn't get in either.
  await page.goto("/candidates");
  await expect(page.getByText("You don't have access to candidates")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
