import { expect, test, type Page } from "@playwright/test";

// Demo account from the MSW fixtures (src/mocks/fixtures/auth.ts).
const ADMIN = { email: "admin@demo.com", password: "DevOnly123!" };

const html = (page: Page) => page.locator("html");
const themeButton = (page: Page) => page.getByRole("button", { name: "Theme" });
const choose = async (page: Page, name: "Light" | "Dark" | "System") => {
  await themeButton(page).click();
  await page.getByRole("menuitemradio", { name }).click();
};

test.describe("when the operating system is dark", () => {
  test.use({ colorScheme: "dark" });

  test("the app follows it until the user chooses, and the choice is remembered", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(html(page)).toHaveClass(/dark/);

    await test.step("System is the starting choice", async () => {
      await themeButton(page).click();
      await expect(page.getByRole("menuitemradio", { name: "System" })).toBeChecked();
      await page.keyboard.press("Escape");
    });

    await test.step("choosing Light overrides the OS and survives a reload", async () => {
      await choose(page, "Light");
      await expect(html(page)).not.toHaveClass(/dark/);

      await page.reload();
      await expect(html(page)).not.toHaveClass(/dark/);
      await themeButton(page).click();
      await expect(page.getByRole("menuitemradio", { name: "Light" })).toBeChecked();
    });

    await test.step("System goes back to following the OS", async () => {
      await page.keyboard.press("Escape");
      await choose(page, "System");
      await expect(html(page)).toHaveClass(/dark/);
    });
  });
});

test.describe("when the operating system is light", () => {
  test.use({ colorScheme: "light" });

  test("a chosen dark theme follows the user from the login page into the app", async ({
    page,
  }) => {
    await page.goto("/login?next=%2Fjobs");
    await expect(html(page)).not.toHaveClass(/dark/);
    await choose(page, "Dark");
    await expect(html(page)).toHaveClass(/dark/);

    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Jobs Postings" })).toBeVisible();
    await expect(html(page)).toHaveClass(/dark/);
    // The header has its own theme menu once signed in.
    await choose(page, "Light");
    await expect(html(page)).not.toHaveClass(/dark/);
  });

  test("the theme menu works with the keyboard alone", async ({ page }) => {
    await page.goto("/login");
    await themeButton(page).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown"); // Light -> Dark
    await page.keyboard.press("Enter");

    await expect(html(page)).toHaveClass(/dark/);
    await expect(themeButton(page)).toBeFocused();
  });

  test("a saved dark theme is on the page before any app code runs (no flash)", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ats-theme", "dark"));
    // With the app's scripts blocked, only the inline script in <head> can have set this.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(html(page)).toHaveClass(/dark/);
    expect(await html(page).evaluate((el) => el.style.colorScheme)).toBe("dark");
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe("rgb(255, 255, 255)");
  });
});
