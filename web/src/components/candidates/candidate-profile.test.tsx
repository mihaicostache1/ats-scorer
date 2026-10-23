import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockCandidates, mockCvDocuments } from "@/mocks/fixtures/candidates";
import { mockApplications } from "@/mocks/fixtures/applications";
import { mockJobs, mockPipelineStages } from "@/mocks/fixtures/jobs";

const {
  getCandidate,
  listApplications,
  getJob,
  getJobStages,
  listCandidateCvDocuments,
  download,
  toast,
} = vi.hoisted(() => ({
  getCandidate: vi.fn(),
  listApplications: vi.fn(),
  getJob: vi.fn(),
  getJobStages: vi.fn(),
  listCandidateCvDocuments: vi.fn(),
  download: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock("@/api", () => ({
  getCandidate,
  listApplications,
  getJob,
  getJobStages,
  listCandidateCvDocuments,
  downloadCandidateCV: download,
  getCandidateCvDocument: vi.fn(),
  retryCandidateCvExtraction: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => ({ can: () => true }) }));
vi.mock("@/api/upload-cv", () => ({ uploadCandidateCvWithProgress: vi.fn() }));

import { CandidateProfile } from "./candidate-profile";

const alex = mockCandidates[0];
const alexApps = mockApplications.filter((a) => a.candidate_id === alex.id);
const alexCvs = mockCvDocuments.filter((c) => c.candidate_id === alex.id);
const ok = <T,>(data: T) => ({ data, response: { status: 200 } });

beforeEach(() => {
  vi.clearAllMocks();
  getCandidate.mockResolvedValue(ok(alex));
  listApplications.mockResolvedValue(ok({ items: alexApps, pagination: {} }));
  getJob.mockImplementation(async (id: string) => ok(mockJobs.find((j) => j.id === id)));
  getJobStages.mockResolvedValue(ok(mockPipelineStages));
  listCandidateCvDocuments.mockResolvedValue(ok(alexCvs));
});

describe("CandidateProfile", () => {
  it("shows contact info, applications with stages, CVs with parse status and the parsed summary", async () => {
    render(<CandidateProfile id={alex.id} />);

    expect(
      await screen.findByRole("heading", { name: "Alex Mercer", level: 1 })
    ).toBeInTheDocument();

    const contact = within(screen.getByRole("region", { name: "Contact" }));
    expect(contact.getByRole("link", { name: /alex\.mercer@example\.com/ })).toHaveAttribute(
      "href",
      "mailto:alex.mercer@example.com"
    );
    expect(contact.getByRole("link", { name: /\+1-555-0199/ })).toHaveAttribute(
      "href",
      "tel:+15550199"
    );
    expect(contact.getByText("San Francisco, CA")).toBeInTheDocument();

    const applications = within(await screen.findByRole("region", { name: "Applications" }));
    expect(await applications.findByRole("link", { name: mockJobs[0].title })).toHaveAttribute(
      "href",
      `/jobs/${mockJobs[0].id}`
    );
    expect(applications.getAllByText("Shortlisted").length).toBeGreaterThan(0);

    const cvs = within(screen.getByRole("region", { name: "CVs" }));
    expect(await cvs.findByText("alex-mercer.pdf")).toBeInTheDocument();
    expect(cvs.getAllByText(/Parse status:/).length).toBe(alexCvs.length);

    const parsed = within(screen.getByRole("region", { name: "Parsed summary" }));
    expect(parsed.getAllByText("Backend Software Engineer").length).toBeGreaterThan(0);
    expect(parsed.getByText("FastAPI")).toBeInTheDocument();
    expect(parsed.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("shows a loading state first", () => {
    getCandidate.mockReturnValue(new Promise(() => {}));
    render(<CandidateProfile id={alex.id} />);
    expect(screen.getByRole("status", { name: "Loading candidate" })).toBeInTheDocument();
  });

  it("shows not-found for a 404", async () => {
    getCandidate.mockResolvedValue({
      data: undefined,
      error: { detail: "nope" },
      response: { status: 404 },
    });
    render(<CandidateProfile id="missing" />);
    expect(await screen.findByText("Candidate not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to candidates" })).toBeInTheDocument();
  });

  it("shows an error state with retry for other failures", async () => {
    getCandidate.mockResolvedValueOnce({ data: undefined, error: {}, response: { status: 500 } });
    const user = userEvent.setup();
    render(<CandidateProfile id={alex.id} />);
    expect(await screen.findByText("Couldn't load this candidate")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Alex Mercer", level: 1 })
    ).toBeInTheDocument();
  });

  it("shows friendly empty states for a candidate with no applications, CVs or parsed data", async () => {
    const emilia = mockCandidates[3]; // parsed_data is {}
    getCandidate.mockResolvedValue(ok(emilia));
    listApplications.mockResolvedValue(ok({ items: [], pagination: {} }));
    listCandidateCvDocuments.mockResolvedValue(ok([]));
    render(<CandidateProfile id={emilia.id} />);

    expect(await screen.findByText("Not applied to any job yet.")).toBeInTheDocument();
    expect(await screen.findByText("No CVs uploaded yet.")).toBeInTheDocument();
    expect(screen.getByText(/Not parsed yet/)).toBeInTheDocument();
  });

  it("shows the reason a CV failed", async () => {
    const failed = mockCvDocuments.find((c) => c.status === "failed")!;
    listCandidateCvDocuments.mockResolvedValue(ok([failed]));
    render(<CandidateProfile id={alex.id} />);

    expect(await screen.findByText(failed.error_message!)).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("keeps the rest of the profile when one section fails, and retries just that section", async () => {
    listCandidateCvDocuments.mockResolvedValueOnce({
      data: undefined,
      error: {},
      response: { status: 500 },
    });
    const user = userEvent.setup();
    render(<CandidateProfile id={alex.id} />);

    expect(await screen.findByText("Couldn't load CVs")).toBeInTheDocument();
    // Other sections are unaffected.
    expect(await screen.findByRole("link", { name: mockJobs[0].title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alex Mercer", level: 1 })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("alex-mercer.pdf")).toBeInTheDocument();
  });

  it("still lists an application when its job can't be loaded", async () => {
    getJob.mockResolvedValue({ data: undefined, error: {}, response: { status: 404 } });
    getJobStages.mockResolvedValue({ data: undefined, error: {}, response: { status: 404 } });
    render(<CandidateProfile id={alex.id} />);

    expect((await screen.findAllByText("Unknown job")).length).toBe(alexApps.length);
    expect(screen.getAllByText("Unknown stage").length).toBe(alexApps.length);
  });

  describe("CV download", () => {
    it("saves the file fetched with the session, without linking to it", async () => {
      const blob = new Blob(["%PDF-"], { type: "application/pdf" });
      download.mockResolvedValue(ok(blob));
      const createObjectURL = vi.fn(() => "blob:cv");
      const revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const user = userEvent.setup();
      render(<CandidateProfile id={alex.id} />);
      await user.click(await screen.findByRole("button", { name: "Download alex-mercer.pdf" }));

      await waitFor(() => expect(download).toHaveBeenCalledWith(alex.id, alexCvs[0].id));
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:cv");
      click.mockRestore();
    });

    it("reports a failed download as a toast", async () => {
      download.mockResolvedValue({
        data: undefined,
        error: { detail: "File is missing" },
        response: { status: 404 },
      });
      const user = userEvent.setup();
      render(<CandidateProfile id={alex.id} />);
      await user.click(await screen.findByRole("button", { name: "Download alex-mercer.pdf" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("File is missing", "Couldn't download CV")
      );
    });
  });
});
