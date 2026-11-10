import { expect, test, type Page } from "@playwright/test";

// Demo accounts and Alex Mercer's CV from the MSW fixtures (src/mocks/fixtures).
const RECRUITER = { email: "recruiter@demo.com", password: "DevOnly123!" };
const VIEWER = { email: "viewer@demo.com", password: "DevOnly123!" };
const ALEX = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const CV = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const REVIEW = `/candidates/${ALEX}/cvs/${CV}/review`;

async function openReview(page: Page, account: { email: string; password: string }) {
  await page.goto(`/login?next=${encodeURIComponent(REVIEW)}`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Review parsed CV", level: 1 })).toBeVisible();
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

test("review, correct and save a parsed CV using only the keyboard", async ({ page }) => {
  await openReview(page, RECRUITER);

  await test.step("the PDF and the form sit side by side, with doubtful fields marked", async () => {
    await expect(page.getByTitle("Original CV: alex-mercer.pdf")).toBeAttached();
    await expect(page.getByText("3 fields to check")).toBeVisible();
    await expect(field(page, "Phone")).toHaveAccessibleDescription(/Low confidence \(50%\)/);
    await expect(field(page, "Email")).not.toHaveAccessibleDescription(/Low confidence/);
  });

  await test.step("a field to check can be reached and corrected from the keyboard", async () => {
    await page.getByRole("button", { name: "Contact · phone · 50%" }).focus();
    await page.keyboard.press("Enter");
    await expect(field(page, "Phone")).toBeFocused();

    await page.keyboard.press("Control+A");
    await page.keyboard.type("+1-555-0100");
    await page.keyboard.press("Control+S");

    await expect(page.getByText("Corrections saved")).toBeVisible();
    await expect(page.getByText(/Last reviewed/)).toBeVisible();
    // The server now trusts that value, so it is no longer flagged.
    await expect(page.getByText("2 fields to check")).toBeVisible();
    await expect(field(page, "Phone")).toHaveValue("+1-555-0100");
    await expect(field(page, "Phone")).not.toHaveAccessibleDescription(/Low confidence/);
  });

  await test.step("invalid data is not sent, and focus goes to the problem", async () => {
    await field(page, "Skill 1 as written").focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Control+S");

    await expect(page.getByText("Fix 1 problem to save")).toBeVisible();
    await expect(field(page, "Skill 1 as written")).toBeFocused();
    await expect(field(page, "Skill 1 as written")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Corrections saved")).toHaveCount(0);
  });

  await test.step("leaving with unsaved changes asks first", async () => {
    const back = page.getByRole("link", { name: "Back to candidate" }).first();
    await back.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Discard unsaved changes?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${CV}/review$`));

    await back.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    // The dialog moves focus to "Keep editing" a moment after it opens. Wait for that before
    // pressing Tab, or on a slow run the Tab comes first and starts from the wrong place.
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Discard changes" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`/candidates/${ALEX}$`));
  });
});

test("the saved correction is still there after a reload of the candidate", async ({ page }) => {
  await openReview(page, RECRUITER);

  await field(page, "Headline").fill("Principal Engineer");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByText("Corrections saved")).toBeVisible();

  // The mock keeps changes for the browser session, so the profile page shows them too.
  await page.getByRole("link", { name: "Back to candidate" }).first().click();
  await expect(page.getByRole("heading", { name: "Alex Mercer", level: 1 })).toBeVisible();
  await expect(page.getByText("Principal Engineer")).toBeVisible();
});

test("a viewer sees the screen read-only", async ({ page }) => {
  await openReview(page, VIEWER);

  await expect(page.getByText(/your role can.t change them/)).toBeVisible();
  await expect(page.getByTitle("Original CV: alex-mercer.pdf")).toBeAttached();
  await expect(field(page, "Name")).toHaveValue("Alex Mercer");
  await expect(field(page, "Name")).toBeDisabled();
  await expect(field(page, "Headline")).toBeDisabled();

  await expect(page.getByRole("button", { name: "Save corrections" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm as correct" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add skill" })).toHaveCount(0);
});
