import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockCvDocuments } from "@/mocks/fixtures/candidates";
import type { CvDocument } from "./cv-status";

const {
  listCandidateCvDocuments,
  getCandidateCvDocument,
  retryCandidateCvExtraction,
  downloadCandidateCV,
  uploadCandidateCvWithProgress,
  toast,
  session,
} = vi.hoisted(() => ({
  listCandidateCvDocuments: vi.fn(),
  getCandidateCvDocument: vi.fn(),
  retryCandidateCvExtraction: vi.fn(),
  downloadCandidateCV: vi.fn(),
  uploadCandidateCvWithProgress: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  session: { can: vi.fn(() => true) },
}));

vi.mock("@/api", () => ({
  listCandidateCvDocuments,
  getCandidateCvDocument,
  retryCandidateCvExtraction,
  downloadCandidateCV,
}));
vi.mock("@/api/upload-cv", () => ({ uploadCandidateCvWithProgress }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => session }));

import { CandidateCvs } from "./candidate-cvs";

const CANDIDATE = "cand-1";
const make = (over: Partial<CvDocument>): CvDocument => ({
  ...mockCvDocuments[0],
  id: "cv-new",
  candidate_id: CANDIDATE,
  original_filename: "alex.pdf",
  status: "queued",
  page_count: null,
  ocr_used: false,
  error_code: null,
  error_message: null,
  attempts: 0,
  processed_at: null,
  ...over,
});
const ok = <T,>(data: T) => ({ data, response: { status: 200 } });
const fail = (status: number, detail: string) => ({
  data: undefined,
  error: { detail },
  response: { status },
});

const pdf = (name = "alex.pdf") =>
  new File(["%PDF-1.4 ... %%EOF"], name, { type: "application/pdf" });
const live = () => document.querySelector('p[aria-live="polite"]')?.textContent;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const choose = async (user: ReturnType<typeof userEvent.setup>, file = pdf()) =>
  user.upload(screen.getByLabelText("Choose PDF"), file);

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  vi.clearAllMocks();
  session.can.mockReturnValue(true);
  listCandidateCvDocuments.mockResolvedValue(ok([]));
});
afterEach(() => vi.useRealTimers());

describe("CandidateCvs: uploading", () => {
  it("follows a new upload from queued to parsed, announcing each change", async () => {
    uploadCandidateCvWithProgress.mockResolvedValue({ ok: true, data: make({}) });
    getCandidateCvDocument
      .mockResolvedValueOnce(ok(make({ status: "extracting", attempts: 1 })))
      .mockResolvedValueOnce(ok(make({ status: "parsed", page_count: 2, attempts: 1 })));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("No CVs uploaded yet.");

    await choose(user);
    expect(uploadCandidateCvWithProgress).toHaveBeenCalledWith(
      CANDIDATE,
      expect.any(File),
      expect.objectContaining({ onProgress: expect.any(Function), signal: expect.any(AbortSignal) })
    );
    expect(await screen.findByText("Waiting to be processed…")).toBeInTheDocument();
    expect(live()).toBe("alex.pdf uploaded. Waiting to be processed…");

    await advance(1000);
    expect(await screen.findByText("Extracting text…")).toBeInTheDocument();
    expect(live()).toBe("alex.pdf: Extracting text…");

    await advance(1500);
    expect(await screen.findByText("Parsed and ready to review.")).toBeInTheDocument();
    expect(live()).toBe("alex.pdf: Parsed and ready to review.");
    expect(screen.getByRole("link", { name: "Review alex.pdf" })).toHaveAttribute(
      "href",
      `/candidates/${CANDIDATE}/cvs/cv-new/review`
    );
    expect(screen.getByText(/Parse status:/).parentElement).toHaveTextContent(
      "Parse status: Parsed"
    );

    // Done: no more requests.
    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(2);
  });

  it("shows a needs-review CV with a link to review it", async () => {
    uploadCandidateCvWithProgress.mockResolvedValue({ ok: true, data: make({}) });
    getCandidateCvDocument.mockResolvedValue(ok(make({ status: "needs_review", attempts: 1 })));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("No CVs uploaded yet.");
    await choose(user);
    await screen.findByText("Waiting to be processed…");

    await advance(1000);
    expect(
      await screen.findByText("Parsed, but some fields need a human check.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review alex.pdf" })).toBeInTheDocument();
  });

  it("shows a progress bar while sending, and lets the user cancel", async () => {
    let report!: (percent: number) => void;
    let signal!: AbortSignal;
    uploadCandidateCvWithProgress.mockImplementation(
      (
        _id: string,
        _file: File,
        options: { onProgress: (p: number) => void; signal: AbortSignal }
      ) =>
        new Promise((resolve) => {
          report = options.onProgress;
          signal = options.signal;
          options.signal.addEventListener("abort", () => resolve({ ok: false, aborted: true }));
        })
    );
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("No CVs uploaded yet.");
    await choose(user);

    const bar = await screen.findByRole("progressbar", { name: "Uploading alex.pdf" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    act(() => report(40));
    expect(screen.getByRole("progressbar", { name: "Uploading alex.pdf" })).toHaveAttribute(
      "aria-valuenow",
      "40"
    );
    expect(screen.getByText(/Uploading… 40%/)).toBeInTheDocument();
    // Progress ticks are not announced; the start is.
    expect(live()).toBe("Uploading alex.pdf");

    await user.click(screen.getByRole("button", { name: "Cancel upload of alex.pdf" }));
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(live()).toBe("Upload cancelled");
  });

  it("stops sending a file when the page is left", async () => {
    let signal!: AbortSignal;
    uploadCandidateCvWithProgress.mockImplementation(
      (_id: string, _file: File, options: { signal: AbortSignal }) =>
        new Promise(() => {
          signal = options.signal;
        })
    );
    const { unmount } = render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("No CVs uploaded yet.");
    await choose(user);
    await screen.findByRole("progressbar");

    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("explains an upload that failed and lets the user try again", async () => {
    uploadCandidateCvWithProgress
      .mockResolvedValueOnce({
        ok: false,
        aborted: false,
        message: "The file is larger than the 10 MB limit.",
        status: 413,
      })
      .mockResolvedValueOnce({ ok: true, data: make({}) });
    getCandidateCvDocument.mockResolvedValue(ok(make({ status: "extracting", attempts: 1 })));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("No CVs uploaded yet.");
    await choose(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file is larger than the 10 MB limit."
    );
    expect(screen.getByText(/Upload failed/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Waiting to be processed…")).toBeInTheDocument();
    expect(uploadCandidateCvWithProgress).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Upload failed/)).not.toBeInTheDocument();
  });

  it("lets a failed upload be dismissed", async () => {
    uploadCandidateCvWithProgress.mockResolvedValue({
      ok: false,
      aborted: false,
      message: "Can't reach the server. Check your connection and try again.",
      status: 0,
    });
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("No CVs uploaded yet.");
    await choose(user);
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Dismiss alex.pdf" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not offer upload to roles that can't write", async () => {
    session.can.mockReturnValue(false);
    listCandidateCvDocuments.mockResolvedValue(
      ok([make({ status: "failed", error_code: "timeout" })])
    );
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("alex.pdf");
    expect(screen.queryByLabelText("Choose PDF")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });
});

describe("CandidateCvs: existing CVs", () => {
  it("carries on following a CV that was still processing when the page opened", async () => {
    listCandidateCvDocuments.mockResolvedValue(ok([make({ status: "extracting", attempts: 1 })]));
    getCandidateCvDocument.mockResolvedValue(ok(make({ status: "parsed", attempts: 1 })));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    expect(await screen.findByText("Extracting text…")).toBeInTheDocument();
    // Showing what was already there is not news.
    expect(live()).toBe("");

    await advance(1000);
    expect(await screen.findByText("Parsed and ready to review.")).toBeInTheDocument();
    expect(live()).toBe("alex.pdf: Parsed and ready to review.");
  });

  it("does not poll CVs that are already finished", async () => {
    listCandidateCvDocuments.mockResolvedValue(
      ok([
        make({ id: "a", status: "parsed" }),
        make({ id: "b", status: "failed", error_code: "x" }),
      ])
    );
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findAllByText("alex.pdf");
    await advance(60_000);
    expect(getCandidateCvDocument).not.toHaveBeenCalled();
  });

  it("stops polling when the page is left", async () => {
    listCandidateCvDocuments.mockResolvedValue(ok([make({ status: "queued" })]));
    getCandidateCvDocument.mockResolvedValue(ok(make({ status: "extracting", attempts: 1 })));
    const { unmount } = render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("Waiting to be processed…");
    await advance(1000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);

    unmount();
    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
  });

  it("says when a CV is retrying by itself", async () => {
    listCandidateCvDocuments.mockResolvedValue(
      ok([
        make({ status: "queued", attempts: 1, error_code: "timeout", error_message: "Timed out" }),
      ])
    );
    getCandidateCvDocument.mockResolvedValue(
      ok(make({ status: "queued", attempts: 1, error_code: "timeout" }))
    );
    render(<CandidateCvs candidateId={CANDIDATE} />);
    expect(await screen.findByText("Retrying automatically (attempt 2 of 3)…")).toBeInTheDocument();
  });

  it("offers Check again after losing contact, and carries on when asked", async () => {
    listCandidateCvDocuments.mockResolvedValue(ok([make({ status: "queued" })]));
    getCandidateCvDocument.mockRejectedValue(new TypeError("offline"));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("Waiting to be processed…");

    await advance(60_000);
    expect(
      await screen.findByText("We lost contact with the server while checking progress.")
    ).toBeInTheDocument();

    getCandidateCvDocument.mockReset();
    getCandidateCvDocument.mockResolvedValue(ok(make({ status: "parsed", attempts: 1 })));
    await user.click(screen.getByRole("button", { name: "Check again" }));
    await advance(1000);
    expect(await screen.findByText("Parsed and ready to review.")).toBeInTheDocument();
  });
});

describe("CandidateCvs: failures and retry", () => {
  const failed = make({
    status: "failed",
    attempts: 3,
    error_code: "internal_error",
    error_message: "An unexpected error occurred during extraction. Gave up after 3 attempts.",
  });

  it("shows the reason, what to do next, and a Retry button", async () => {
    listCandidateCvDocuments.mockResolvedValue(ok([failed]));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    expect(
      await screen.findByText(
        "An unexpected error occurred during extraction. Gave up after 3 attempts."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("This is usually temporary. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry alex.pdf" })).toBeInTheDocument();
  });

  it("gives advice that fits the file for errors a retry can't fix", async () => {
    listCandidateCvDocuments.mockResolvedValue(
      ok([
        make({
          status: "failed",
          error_code: "encrypted_pdf",
          error_message: "The PDF is password-protected and cannot be read.",
        }),
      ])
    );
    render(<CandidateCvs candidateId={CANDIDATE} />);
    expect(
      await screen.findByText("Remove the password protection and upload the file again.")
    ).toBeInTheDocument();
  });

  it("retries, then follows the CV through to the end", async () => {
    listCandidateCvDocuments.mockResolvedValue(ok([failed]));
    retryCandidateCvExtraction.mockResolvedValue(
      ok(make({ status: "queued", attempts: 0, error_code: null, error_message: null }))
    );
    getCandidateCvDocument
      .mockResolvedValueOnce(ok(make({ status: "extracting", attempts: 1 })))
      .mockResolvedValueOnce(ok(make({ status: "parsed", attempts: 1 })));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await user.click(await screen.findByRole("button", { name: "Retry alex.pdf" }));

    expect(retryCandidateCvExtraction).toHaveBeenCalledWith(CANDIDATE, "cv-new");
    expect(await screen.findByText("Waiting to be processed…")).toBeInTheDocument();
    expect(live()).toBe("alex.pdf: Waiting to be processed…");
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();

    await advance(1000);
    await advance(1500);
    expect(await screen.findByText("Parsed and ready to review.")).toBeInTheDocument();
  });

  it("explains a retry the server refuses", async () => {
    listCandidateCvDocuments.mockResolvedValue(ok([failed]));
    retryCandidateCvExtraction.mockResolvedValue(
      fail(409, "A CV document with status 'parsed' cannot be retried.")
    );
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await user.click(await screen.findByRole("button", { name: "Retry alex.pdf" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A CV document with status 'parsed' cannot be retried.",
        "Couldn't retry"
      )
    );
    // Still failed, still retryable.
    expect(screen.getByRole("button", { name: "Retry alex.pdf" })).toBeEnabled();
  });
});

describe("CandidateCvs: list", () => {
  it("shows an uploaded CV above the existing ones", async () => {
    listCandidateCvDocuments.mockResolvedValue(
      ok([make({ id: "old", original_filename: "old.pdf", status: "parsed" })])
    );
    uploadCandidateCvWithProgress.mockResolvedValue({
      ok: true,
      data: make({ id: "fresh", original_filename: "fresh.pdf" }),
    });
    getCandidateCvDocument.mockResolvedValue(ok(make({ id: "fresh", status: "extracting" })));
    render(<CandidateCvs candidateId={CANDIDATE} />);
    await screen.findByText("old.pdf");
    await choose(user, pdf("fresh.pdf"));

    await screen.findByText("fresh.pdf");
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText("fresh.pdf")).toBeInTheDocument();
    expect(within(items[1]).getByText("old.pdf")).toBeInTheDocument();
  });
});
