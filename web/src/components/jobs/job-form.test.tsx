import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockJobs } from "@/mocks/fixtures/jobs";

const { push, createJob, updateJob, toast, session } = vi.hoisted(() => ({
  push: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  session: { can: vi.fn(() => true) },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/api", () => ({ createJob, updateJob }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => session }));

import { JobForm } from "./job-form";

const job = mockJobs[0];

beforeEach(() => {
  vi.clearAllMocks();
  session.can.mockReturnValue(true);
});

describe("JobForm (create)", () => {
  it("shows inline errors and does not call the API when required fields are empty", async () => {
    const user = userEvent.setup();
    render(<JobForm />);
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("Enter a job title")).toBeInTheDocument();
    expect(screen.getByText("Enter a job description")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("aria-invalid", "true");
    expect(createJob).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("creates the job with chips for skills and goes to its page", async () => {
    createJob.mockResolvedValue({
      data: { ...job, id: "new-id", title: "Dev" },
      response: { status: 201 },
    });
    const user = userEvent.setup();
    render(<JobForm />);

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Dev");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Write code");
    await user.type(
      screen.getByRole("textbox", { name: "Required skills" }),
      "Python{Enter}SQL{Enter}"
    );
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0][0]).toMatchObject({
      title: "Dev",
      description: "Write code",
      required_skills: ["Python", "SQL"],
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/jobs/new-id"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("reports a server error as a toast and marks the field inline on a 422", async () => {
    createJob.mockResolvedValue({
      data: undefined,
      error: {
        detail: [{ loc: ["body", "title"], msg: "String should have at most 255 characters" }],
      },
      response: { status: 422 },
    });
    const user = userEvent.setup();
    render(<JobForm />);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Dev");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Write code");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Please fix the highlighted fields.",
        "Couldn't create job"
      )
    );
    expect(
      await screen.findByText("String should have at most 255 characters")
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("reports a thrown request as a toast", async () => {
    createJob.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<JobForm />);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Dev");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Write code");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("is not available to read-only roles", () => {
    session.can.mockReturnValue(false);
    render(<JobForm />);
    expect(screen.getByText("You can't edit jobs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create job" })).not.toBeInTheDocument();
  });
});

describe("JobForm (edit)", () => {
  it("is pre-filled and sends only what changed", async () => {
    updateJob.mockResolvedValue({ data: { ...job, title: "Renamed" }, response: { status: 200 } });
    const user = userEvent.setup();
    render(<JobForm job={job} />);

    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveValue(job.title);
    await user.clear(title);
    await user.type(title, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateJob).toHaveBeenCalledWith(job.id, { title: "Renamed" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/jobs/${job.id}`));
  });
});
