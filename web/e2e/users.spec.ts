import { expect, test, type Page } from "@playwright/test";

// Demo accounts and invitation tokens from the MSW fixtures (src/mocks/fixtures/*).
const PASSWORD = "DevOnly123!";
const ADMIN = { email: "admin@demo.com", name: "Marcus Cole" };
const RECRUITER = { email: "recruiter@demo.com", name: "Sarah Jenkins" };
const VALID_TOKEN = "demo-valid-invite"; // for new.colleague@demo.com, as a recruiter
const EXPIRED_TOKEN = "demo-expired-invite";

// Next.js has its own (empty) role="alert" route announcer, so alerts are matched on their text.
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("admin manages users: sees why the last admin and yourself are protected, and invites someone", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await test.step("an admin finds Users in the navigation and sees the members", async () => {
    await signIn(page, ADMIN.email, "/jobs");
    await page.getByRole("link", { name: "Team" }).first().click();

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole("heading", { name: "Team", level: 1 })).toBeVisible();
    await expect(page.getByText("Showing 1 – 7 of 7 users")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(ADMIN.name) })).toContainText("You");
    await expect(page.getByRole("row", { name: /Jonas Weber/ })).toContainText("Inactive");
  });

  await test.step("demoting the only admin is refused with a clear message", async () => {
    await page.getByLabel(`Change role for ${ADMIN.name}`).selectOption("recruiter");

    await expect(alertWith(page, "At least one active admin is required")).toBeVisible();
    await expect(page.getByLabel(`Change role for ${ADMIN.name}`)).toHaveValue("admin");
  });

  await test.step("deactivating yourself is refused inside the confirmation dialog", async () => {
    await page.getByRole("button", { name: `Deactivate ${ADMIN.name}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Deactivate your own account?");
    await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();

    await expect(dialog.getByRole("alert")).toContainText("You can't deactivate your own account");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(ADMIN.name) })).toContainText("Active");
  });

  await test.step("changing another user's role works", async () => {
    await page.getByLabel(`Change role for ${RECRUITER.name}`).selectOption("viewer");

    await expect(page.getByLabel(`Change role for ${RECRUITER.name}`)).toHaveValue("viewer");
  });

  await test.step("deactivating another user needs a confirmation, then marks them inactive", async () => {
    await page.getByRole("button", { name: "Deactivate Priya Raman" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Deactivate this user?");
    await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row", { name: /Priya Raman/ })).toContainText("Inactive");
  });

  await test.step("inviting someone gives a link that can be copied", async () => {
    await page.getByRole("button", { name: /Invite user/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill("fresh.hire@demo.com");
    await dialog.getByLabel("Role").selectOption("viewer");
    await dialog.getByRole("button", { name: "Create invite link" }).click();

    const link = dialog.getByLabel("Invitation link");
    await expect(link).toHaveValue(/\/accept-invite#token=[A-Za-z0-9]{40,}$/);
    await expect(dialog).toContainText("works once");

    await dialog.getByRole("button", { name: "Copy link" }).click();
    await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await link.inputValue());

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("inviting an existing member is refused on the email field", async () => {
    await page.getByRole("button", { name: /Invite user/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill(RECRUITER.email);
    await dialog.getByRole("button", { name: "Create invite link" }).click();

    await expect(dialog.getByText("A user with this email already exists")).toBeVisible();
  });
});

test("a recruiter cannot reach user management", async ({ page }) => {
  await signIn(page, RECRUITER.email, "/users");

  await expect(page.getByText("You don't have access to user management")).toBeVisible();
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
});

test("an invitee accepts a valid link, then signs in with the new account", async ({ page }) => {
  await test.step("the link opens the form and the token leaves the address bar", async () => {
    await page.goto(`/accept-invite#token=${VALID_TOKEN}`);

    await expect(page.getByRole("heading", { name: "Accept your invitation" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe("");
  });

  await test.step("a weak password is stopped, then a good one creates the account", async () => {
    await page.getByLabel("Your name").fill("New Colleague");
    await page.getByLabel("Password", { exact: true }).fill("12345678");
    await page.getByLabel("Confirm password").fill("12345678");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Password is too common")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill("Str0ngPass!");
    await page.getByLabel("Confirm password").fill("Str0ngPass!");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Account created" })).toBeVisible();
  });

  await test.step("the new account can sign in and is a recruiter, not an admin", async () => {
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await page.getByLabel("Email").fill("new.colleague@demo.com");
    await page.getByLabel("Password").fill("Str0ngPass!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("link", { name: "Jobs", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  });
});

test.describe("the expired-invite page", () => {
  test("an expired link shows the expired page once it is submitted", async ({ page }) => {
    await page.goto(`/accept-invite#token=${EXPIRED_TOKEN}`);
    await page.getByLabel("Your name").fill("Late Invitee");
    await page.getByLabel("Password", { exact: true }).fill("Str0ngPass!");
    await page.getByLabel("Confirm password").fill("Str0ngPass!");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.getByRole("heading", { name: "This invitation link has expired" })
    ).toBeVisible();
    await expect(
      page.getByText("Ask your workspace admin to send you a new invitation.")
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "Go to sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a link with no token shows it immediately", async ({ page }) => {
    await page.goto("/accept-invite");

    await expect(
      page.getByRole("heading", { name: "This invitation link has expired" })
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  });

  test("a link that was already used shows the same page", async ({ page }) => {
    await page.goto("/accept-invite#token=demo-used-invite");
    await page.getByLabel("Your name").fill("Already Joined");
    await page.getByLabel("Password", { exact: true }).fill("Str0ngPass!");
    await page.getByLabel("Confirm password").fill("Str0ngPass!");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.getByRole("heading", { name: "This invitation link has expired" })
    ).toBeVisible();
  });
});
