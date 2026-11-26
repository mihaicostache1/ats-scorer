import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAccounts } from "@/mocks/fixtures/auth";
import { mockMembers } from "@/mocks/fixtures/users";

const { push, replace, listUsers, changeUserRole, deactivateUser, toast, session } = vi.hoisted(
  () => ({
    push: vi.fn(),
    replace: vi.fn(),
    listUsers: vi.fn(),
    changeUserRole: vi.fn(),
    deactivateUser: vi.fn(),
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
    session: { user: null as { id: string } | null, admin: true },
  })
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/users",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/api", () => ({ listUsers, changeUserRole, deactivateUser, inviteUser: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/providers/session-provider", () => ({
  useSession: () => ({ user: session.user, can: () => session.admin }),
}));

import { UserAccess } from "./user-access";
import { UsersList } from "./users-list";

const admin = mockAccounts[0].user;
const recruiter = mockAccounts[1].user;
const members = [admin, recruiter, ...mockMembers.map((m) => m.user)];

const page = (items = members) => ({
  data: {
    items,
    pagination: {
      page: 1,
      per_page: 10,
      total_items: items.length,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
  },
  response: { status: 200 },
});

const refusal = (status: number, detail: string) => ({
  data: undefined,
  error: { detail },
  response: { status },
});

const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: admin.id };
  session.admin = true;
  listUsers.mockResolvedValue(page());
});

describe("UsersList", () => {
  it("lists members with their role and status, and marks the signed-in admin", async () => {
    render(<UsersList />);

    expect(await screen.findByText(recruiter.full_name)).toBeInTheDocument();
    expect(within(rowOf(admin.full_name)).getByText("You")).toBeInTheDocument();
    expect(within(rowOf(recruiter.full_name)).queryByText("You")).not.toBeInTheDocument();
    expect(screen.getByLabelText(`Change role for ${recruiter.full_name}`)).toHaveValue(
      "recruiter"
    );
    expect(within(rowOf("Jonas Weber")).getByText("Inactive")).toBeInTheDocument();
    // No Deactivate button for someone who is already inactive.
    expect(
      screen.queryByRole("button", { name: "Deactivate Jonas Weber" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(`Showing 1 – ${members.length} of ${members.length} users`)
    ).toBeInTheDocument();
  });

  describe("changing a role", () => {
    it("saves it and updates the row", async () => {
      changeUserRole.mockResolvedValue({
        data: { ...recruiter, role: "viewer" },
        response: { status: 200 },
      });
      const user = userEvent.setup();
      render(<UsersList />);

      await user.selectOptions(
        await screen.findByLabelText(`Change role for ${recruiter.full_name}`),
        "viewer"
      );

      expect(changeUserRole).toHaveBeenCalledWith(recruiter.id, { role: "viewer" });
      await waitFor(() =>
        expect(screen.getByLabelText(`Change role for ${recruiter.full_name}`)).toHaveValue(
          "viewer"
        )
      );
      expect(toast.success).toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("explains why the last admin cannot be demoted, and keeps the saved role", async () => {
      changeUserRole.mockResolvedValue(refusal(409, "The last active admin cannot be removed"));
      const user = userEvent.setup();
      render(<UsersList />);

      const select = await screen.findByLabelText(`Change role for ${admin.full_name}`);
      await user.selectOptions(select, "recruiter");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("At least one active admin is required");
      expect(alert).toHaveTextContent(/only active admin/i);
      expect(select).toHaveValue("admin");
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("lets the message be dismissed", async () => {
      changeUserRole.mockResolvedValue(refusal(409, "The last active admin cannot be removed"));
      const user = userEvent.setup();
      render(<UsersList />);
      await user.selectOptions(
        await screen.findByLabelText(`Change role for ${admin.full_name}`),
        "viewer"
      );

      await user.click(await screen.findByRole("button", { name: "Dismiss message" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("disables the picker for an inactive user", async () => {
      render(<UsersList />);
      expect(await screen.findByLabelText("Change role for Jonas Weber")).toBeDisabled();
    });
  });

  describe("deactivating", () => {
    it("asks for confirmation first, with focus on Cancel", async () => {
      const user = userEvent.setup();
      render(<UsersList />);

      await user.click(await screen.findByRole("button", { name: "Deactivate Sarah Jenkins" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Deactivate this user?");
      expect(dialog).toHaveTextContent("Sarah Jenkins");
      await waitFor(() =>
        expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus()
      );
      expect(deactivateUser).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(deactivateUser).not.toHaveBeenCalled();
    });

    it("deactivates another user after confirmation and marks the row inactive", async () => {
      deactivateUser.mockResolvedValue({
        data: { ...recruiter, is_active: false },
        response: { status: 200 },
      });
      const user = userEvent.setup();
      render(<UsersList />);

      await user.click(await screen.findByRole("button", { name: "Deactivate Sarah Jenkins" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

      expect(deactivateUser).toHaveBeenCalledWith(recruiter.id);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(within(rowOf(recruiter.full_name)).getByText("Inactive")).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalled();
    });

    it("explains that you cannot deactivate yourself, and keeps the dialog open", async () => {
      deactivateUser.mockResolvedValue(refusal(409, "You cannot deactivate your own account"));
      const user = userEvent.setup();
      render(<UsersList />);

      // The button is deliberately enabled on your own row.
      await user.click(
        await screen.findByRole("button", { name: `Deactivate ${admin.full_name}` })
      );
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Deactivate your own account?");
      await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("You can't deactivate your own account");
      expect(alert).toHaveTextContent(/another admin/i);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // The row did not change.
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(within(rowOf(admin.full_name)).getByText("Active")).toBeInTheDocument();
    });

    it("explains the last-admin refusal in the dialog", async () => {
      deactivateUser.mockResolvedValue(refusal(409, "The last active admin cannot be removed"));
      const user = userEvent.setup();
      render(<UsersList />);

      await user.click(await screen.findByRole("button", { name: "Deactivate Sarah Jenkins" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("At least one active admin is required");
      expect(alert).toHaveTextContent(/can't be deactivated/i);
    });

    it("does not show an earlier refusal when the dialog is opened for someone else", async () => {
      deactivateUser.mockResolvedValue(refusal(409, "You cannot deactivate your own account"));
      const user = userEvent.setup();
      render(<UsersList />);
      await user.click(
        await screen.findByRole("button", { name: `Deactivate ${admin.full_name}` })
      );
      let dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
      await within(dialog).findByRole("alert");
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Deactivate Sarah Jenkins" }));

      dialog = await screen.findByRole("dialog");
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("shows an error state with a retry when the list cannot be loaded", async () => {
    listUsers.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Admin privileges required" },
      response: { status: 403 },
    });
    render(<UsersList />);

    expect(await screen.findByText("Couldn't load users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });

  it("opens the invite dialog from the header button", async () => {
    const user = userEvent.setup();
    render(<UsersList />);

    await user.click(await screen.findByRole("button", { name: /invite user/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Invite a colleague");
  });
});

describe("UserAccess", () => {
  it("shows a lock instead of the page, and fetches nothing, for non-admins", () => {
    session.admin = false;
    render(
      <UserAccess>
        <UsersList />
      </UserAccess>
    );

    expect(screen.getByText("You don't have access to user management")).toBeInTheDocument();
    expect(listUsers).not.toHaveBeenCalled();
  });
});
