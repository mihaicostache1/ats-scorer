import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockJobs } from "@/mocks/fixtures/jobs";

const { push, getJob, updateJobStatus, archiveJob, toast, session } = vi.hoisted(() => ({
  push: vi.fn(),
  getJob: vi.fn(),
  updateJobStatus: vi.fn(),
  archiveJob: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  session: { can: vi.fn(() => true) },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/api", () => ({ getJob, updateJobStatus, archiveJob }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => session }));

import { JobDetail } from "./job-detail";

const open = { ...mockJobs.find((j) => j.status === "open")!, title: "Open job" };

beforeEach(() => {
  vi.clearAllMocks();
  session.can.mockReturnValue(true);
  getJob.mockResolvedValue({ data: open, response: { status: 200 } });
});

describe("JobDetail", () => {
  it("shows the job and its skills", async () => {
    render(<JobDetail id={open.id} />);
    expect(await screen.findByRole("heading", { name: "Open job", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit/ })).toHaveAttribute(
      "href",
      `/jobs/${open.id}/edit`
    );
  });

  it("hides write actions from read-only roles", async () => {
    session.can.mockReturnValue(false);
    render(<JobDetail id={open.id} />);
    await screen.findByRole("heading", { name: "Open job" });
    expect(screen.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close job" })).not.toBeInTheDocument();
  });

  it("shows a not-found state for a 404", async () => {
    getJob.mockResolvedValue({
      data: undefined,
      error: { detail: "nope" },
      response: { status: 404 },
    });
    render(<JobDetail id="missing" />);
    expect(await screen.findByText("Job not found")).toBeInTheDocument();
  });

  it("asks for confirmation before closing, focusing Cancel first", async () => {
    updateJobStatus.mockResolvedValue({
      data: { ...open, status: "closed" },
      response: { status: 200 },
    });
    const user = userEvent.setup();
    render(<JobDetail id={open.id} />);
    await user.click(await screen.findByRole("button", { name: "Close job" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Close this job?");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    expect(updateJobStatus).not.toHaveBeenCalled();

    await user.click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Close job")!
    );
    await waitFor(() =>
      expect(updateJobStatus).toHaveBeenCalledWith(open.id, { status: "closed" })
    );
    expect(await screen.findByText(/This job is closed/)).toBeInTheDocument();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<JobDetail id={open.id} />);
    await user.click(await screen.findByRole("button", { name: "Close job" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateJobStatus).not.toHaveBeenCalled();
  });

  it("closes with Escape without calling the API", async () => {
    const user = userEvent.setup();
    render(<JobDetail id={open.id} />);
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(archiveJob).not.toHaveBeenCalled();
  });

  it("archives after confirming and returns to the list", async () => {
    archiveJob.mockResolvedValue({
      data: { ...open, status: "archived" },
      response: { status: 200 },
    });
    const user = userEvent.setup();
    render(<JobDetail id={open.id} />);
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Archive job")!
    );

    await waitFor(() => expect(archiveJob).toHaveBeenCalledWith(open.id));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/jobs"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("reports a failed status change as a toast and keeps the job unchanged", async () => {
    updateJobStatus.mockResolvedValue({
      data: undefined,
      error: { detail: "Not enough privileges" },
      response: { status: 403 },
    });
    const user = userEvent.setup();
    render(<JobDetail id={open.id} />);
    await user.click(await screen.findByRole("button", { name: "Close job" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Close job")!
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Not enough privileges", "Couldn't close job")
    );
    expect(push).not.toHaveBeenCalled();
  });
});
