import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { acceptInvitation } = vi.hoisted(() => ({ acceptInvitation: vi.fn() }));

vi.mock("@/api", () => ({ acceptInvitation }));

import { AcceptInviteForm, parseInviteToken } from "./accept-invite-form";

const created = () => ({
  data: {
    id: "u-1",
    org_id: "o-1",
    email: "fresh@demo.com",
    full_name: "Fresh Face",
    role: "recruiter",
    is_active: true,
  },
  response: { status: 201 },
});

const failure = (status: number, detail: unknown) => ({
  data: undefined,
  error: { detail },
  response: { status },
});

/** Opens the page the way an invitee does: from a link whose fragment holds the token. */
function openLink(hash: string) {
  window.history.replaceState(null, "", `/accept-invite${hash}`);
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  over: { name?: string; password?: string; confirm?: string } = {}
) {
  await user.type(await screen.findByLabelText("Your name"), over.name ?? "Fresh Face");
  await user.type(screen.getByLabelText("Password"), over.password ?? "Str0ngPass!");
  await user.type(
    screen.getByLabelText("Confirm password"),
    over.confirm ?? over.password ?? "Str0ngPass!"
  );
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

const expiredHeading = () =>
  screen.getByRole("heading", { name: "This invitation link has expired" });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("parseInviteToken", () => {
  it("reads the token from the fragment", () => {
    expect(parseInviteToken("#token=abc123")).toBe("abc123");
    expect(parseInviteToken("token=abc123")).toBe("abc123");
  });

  it("rejects missing, empty and oversized tokens", () => {
    expect(parseInviteToken("")).toBeNull();
    expect(parseInviteToken("#")).toBeNull();
    expect(parseInviteToken("#other=1")).toBeNull();
    expect(parseInviteToken("#token=")).toBeNull();
    expect(parseInviteToken(`#token=${"x".repeat(257)}`)).toBeNull();
  });
});

describe("AcceptInviteForm", () => {
  describe("a link with no usable token", () => {
    it.each([
      ["no fragment at all", ""],
      ["an empty token", "#token="],
      ["some other fragment", "#hello"],
    ])("shows the expired page straight away for %s", (_name, hash) => {
      openLink(hash);

      render(<AcceptInviteForm />);

      expect(expiredHeading()).toBeInTheDocument();
      expect(
        screen.getByText(/ask your workspace admin to send you a new invitation/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/expire after 48 hours and work only once/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
      // Nothing to fill in for a link that cannot work.
      expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
      expect(acceptInvitation).not.toHaveBeenCalled();
    });
  });

  describe("a link that is expired, used or replaced", () => {
    // The API has no way to check a token without redeeming it, and answers all three with the
    // same 400, so the page can only find out when the form is submitted.
    it("shows the expired page after the API answers 400, instead of a form error", async () => {
      acceptInvitation.mockResolvedValue(failure(400, "Invalid or expired invitation"));
      openLink("#token=demo-expired-invite");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user);

      await waitFor(() => expect(expiredHeading()).toBeInTheDocument());
      expect(acceptInvitation).toHaveBeenCalledWith({
        token: "demo-expired-invite",
        full_name: "Fresh Face",
        password: "Str0ngPass!",
      });
      expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to sign in" })).toBeInTheDocument();
    });
  });

  describe("a valid link", () => {
    it("shows the form, and removes the token from the address bar", async () => {
      openLink("#token=abc123");

      render(<AcceptInviteForm />);

      expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Accept your invitation" })).toBeInTheDocument();
      await waitFor(() => expect(window.location.hash).toBe(""));
      expect(window.location.pathname).toBe("/accept-invite");
    });

    it("creates the account, then sends the person to sign in (no session is started)", async () => {
      acceptInvitation.mockResolvedValue(created());
      openLink("#token=abc123");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user);

      expect(await screen.findByRole("heading", { name: "Account created" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
      expect(acceptInvitation).toHaveBeenCalledWith({
        token: "abc123",
        full_name: "Fresh Face",
        password: "Str0ngPass!",
      });
    });

    it("checks the form before calling the API", async () => {
      openLink("#token=abc123");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user, { password: "short1", confirm: "different" });

      expect(await screen.findByText("At least 8 characters")).toBeInTheDocument();
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
      expect(acceptInvitation).not.toHaveBeenCalled();
    });

    it("rejects a common password locally", async () => {
      openLink("#token=abc123");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user, { password: "12345678" });

      expect(await screen.findByText("Password is too common")).toBeInTheDocument();
      expect(acceptInvitation).not.toHaveBeenCalled();
    });

    it("keeps the form and the token after a server-side 422, so the person can correct it", async () => {
      acceptInvitation.mockResolvedValueOnce(
        failure(422, [
          {
            loc: ["body", "password"],
            msg: "Value error, Password is too common",
            type: "value_error",
          },
        ])
      );
      acceptInvitation.mockResolvedValueOnce(created());
      openLink("#token=abc123");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user);

      expect(await screen.findByText("Password is too common")).toBeInTheDocument();
      expect(screen.getByLabelText("Your name")).toHaveValue("Fresh Face");

      // The fragment is gone from the URL by now; the token must still be there for the retry.
      await user.clear(screen.getByLabelText("Password"));
      await user.clear(screen.getByLabelText("Confirm password"));
      await user.type(screen.getByLabelText("Password"), "An0therPass!");
      await user.type(screen.getByLabelText("Confirm password"), "An0therPass!");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByRole("heading", { name: "Account created" })).toBeInTheDocument();
      expect(acceptInvitation).toHaveBeenLastCalledWith({
        token: "abc123",
        full_name: "Fresh Face",
        password: "An0therPass!",
      });
    });

    it("tells the person to sign in when the email already has an account", async () => {
      acceptInvitation.mockResolvedValue(failure(409, "A user with this email already exists"));
      openLink("#token=abc123");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "An account with this email already exists. Sign in instead."
      );
      expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    });

    it("reports a network failure and keeps the form", async () => {
      acceptInvitation.mockRejectedValue(new TypeError("Failed to fetch"));
      openLink("#token=abc123");
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await fillAndSubmit(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach the server/i);
      expect(screen.getByLabelText("Your name")).toHaveValue("Fresh Face");
    });
  });
});
