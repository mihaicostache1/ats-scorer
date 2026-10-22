import { expect, test } from "@playwright/test";

// Demo account from the MSW fixtures (src/mocks/fixtures/auth.ts).
const ADMIN = { email: "admin@demo.com", password: "DevOnly123!" };

// The mock job store lives in the page, so every step below navigates client-side (links and
// buttons) — a full reload would reset it.
test("admin creates, edits, closes and archives a job", async ({ page }) => {
  await test.step("sign in and open the new-job form from the list", async () => {
    await page.goto("/login?next=%2Fjobs");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("link", { name: "New job" }).click();
    await expect(page).toHaveURL(/\/jobs\/new$/);
    await expect(page.getByRole("heading", { name: "New job" })).toBeVisible();
  });

  await test.step("empty required fields are flagged inline", async () => {
    await page.getByRole("button", { name: "Create job" }).click();

    await expect(page.getByText("Enter a job title")).toBeVisible();
    await expect(page.getByText("Enter a job description")).toBeVisible();
    await expect(page).toHaveURL(/\/jobs\/new$/);
  });

  await test.step("fill the form with the keyboard, adding skills as chips", async () => {
    await page.getByLabel("Title").fill("Platform Engineer");
    await page.getByLabel("Description").fill("Keep the platform healthy.");

    const required = page.getByLabel("Required skills");
    await required.fill("Kubernetes");
    await required.press("Enter");
    await required.pressSequentially("Terraform,");
    await expect(page.getByRole("button", { name: "Remove Kubernetes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Terraform" })).toBeVisible();

    await page.getByRole("button", { name: "Create job" }).click();
  });

  await test.step("the new job opens as a draft", async () => {
    await expect(page.getByRole("heading", { name: "Platform Engineer", level: 1 })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Kubernetes")).toBeVisible();
  });

  await test.step("editing saves the change", async () => {
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByLabel("Title")).toHaveValue("Platform Engineer");

    await page.getByLabel("Title").fill("Senior Platform Engineer");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(
      page.getByRole("heading", { name: "Senior Platform Engineer", level: 1 })
    ).toBeVisible();
  });

  await test.step("closing asks for confirmation first", async () => {
    await page.getByRole("button", { name: "Close job" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Close this job?")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close job" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close job" }).click();
    await expect(page.getByText(/This job is closed/)).toBeVisible();
  });

  await test.step("archiving confirms, then leaves the job out of the list", async () => {
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive job" }).click();

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("link", { name: "Senior Platform Engineer" })).toHaveCount(0);
  });
});

test("a job title in the list opens its detail page", async ({ page }) => {
  await page.goto("/login?next=%2Fjobs");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("table").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to jobs" })).toBeVisible();
});
