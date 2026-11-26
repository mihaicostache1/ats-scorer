import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { inviteUser, toast } = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/api", () => ({ inviteUser }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { InviteUserDialog } from "./invite-user-dialog";

const LINK = "http://localhost:3000/accept-invite#token=abc123secret";

const created = (over: Record<string, unknown> = {}) => ({
  data: {
    id: "inv-1",
    email: "fresh@demo.com",
    role: "viewer",
    expires_at: "2026-11-18T10:00:00Z",
    invite_url: LINK,
    ...over,
  },
  response: { status: 201 },
});

function setup() {
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(<InviteUserDialog open onOpenChange={onOpenChange} />);
  return { user, onOpenChange };
}

async function submitInvite(user: ReturnType<typeof userEvent.setup>, email = "fresh@demo.com") {
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Email"), email);
  await user.click(within(dialog).getByRole("button", { name: "Create invite link" }));
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InviteUserDialog", () => {
  it("creates the invitation with the chosen email and role, defaulting to recruiter", async () => {
    inviteUser.mockResolvedValue(created());
    const { user } = setup();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Role")).toHaveValue("recruiter");
    await user.selectOptions(within(dialog).getByLabelText("Role"), "viewer");
    await user.type(within(dialog).getByLabelText("Email"), "fresh@demo.com");
    await user.click(within(dialog).getByRole("button", { name: "Create invite link" }));

    await waitFor(() =>
      expect(inviteUser).toHaveBeenCalledWith({ email: "fresh@demo.com", role: "viewer" })
    );
  });

  it("shows the link, who it is for, and that it works once and is shown only once", async () => {
    inviteUser.mockResolvedValue(created());
    const { user } = setup();

    const dialog = await submitInvite(user);

    const link = await within(dialog).findByLabelText("Invitation link");
    expect(link).toHaveValue(LINK);
    expect(link).toHaveAttribute("readonly");
    expect(dialog).toHaveTextContent("fresh@demo.com");
    expect(dialog).toHaveTextContent("Expires Nov 18, 2026");
    expect(dialog).toHaveTextContent(/works once/i);
    expect(dialog).toHaveTextContent(/only shown now/i);
  });

  it("copies the link to the clipboard and says so", async () => {
    inviteUser.mockResolvedValue(created());
    const { user } = setup();
    const dialog = await submitInvite(user);
    await within(dialog).findByLabelText("Invitation link");

    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(within(dialog).getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(within(dialog).getByText("Link copied to the clipboard.")).toBeInTheDocument();
  });

  it("selects the link for a manual copy when the clipboard is unavailable", async () => {
    inviteUser.mockResolvedValue(created());
    const { user } = setup();
    const dialog = await submitInvite(user);
    const link = await within(dialog).findByLabelText("Invitation link");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(await within(dialog).findByText(/press Ctrl\+C/i)).toBeInTheDocument();
    expect((link as HTMLInputElement).selectionEnd).toBe(LINK.length);
  });

  it("goes back to an empty form for another invitation", async () => {
    inviteUser.mockResolvedValue(created());
    const { user } = setup();
    const dialog = await submitInvite(user);
    await within(dialog).findByLabelText("Invitation link");

    await user.click(within(dialog).getByRole("button", { name: "Invite another" }));

    expect(within(dialog).getByLabelText("Email")).toHaveValue("");
    expect(within(dialog).queryByLabelText("Invitation link")).not.toBeInTheDocument();
  });

  it("closes from Done", async () => {
    inviteUser.mockResolvedValue(created());
    const { user, onOpenChange } = setup();
    const dialog = await submitInvite(user);
    await within(dialog).findByLabelText("Invitation link");

    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("validates the email before calling the API", async () => {
    const { user } = setup();

    const dialog = await submitInvite(user, "not-an-email");

    expect(await within(dialog).findByText("Enter a valid email address")).toBeInTheDocument();
    expect(inviteUser).not.toHaveBeenCalled();
  });

  it("shows an email that already belongs to a member as a field error", async () => {
    inviteUser.mockResolvedValue({
      data: undefined,
      error: { detail: "A user with this email already exists" },
      response: { status: 409 },
    });
    const { user } = setup();

    const dialog = await submitInvite(user, "recruiter@demo.com");

    expect(
      await within(dialog).findByText("A user with this email already exists")
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).queryByLabelText("Invitation link")).not.toBeInTheDocument();
  });

  it("reports a network failure without losing the form", async () => {
    inviteUser.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user } = setup();

    const dialog = await submitInvite(user);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/can't reach the server/i);
    expect(within(dialog).getByLabelText("Email")).toHaveValue("fresh@demo.com");
  });
});
