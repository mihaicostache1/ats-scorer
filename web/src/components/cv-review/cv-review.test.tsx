import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockCandidates, mockCvDocuments } from "@/mocks/fixtures/candidates";
import type { ParsedCV } from "./parsed-cv-schema";

const {
  getCandidate,
  getCandidateCvDocument,
  listCandidateCvDocuments,
  downloadCandidateCV,
  updateCandidateParsedProfile,
  toast,
  session,
  router,
} = vi.hoisted(() => ({
  getCandidate: vi.fn(),
  getCandidateCvDocument: vi.fn(),
  listCandidateCvDocuments: vi.fn(),
  downloadCandidateCV: vi.fn(),
  updateCandidateParsedProfile: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  session: { can: vi.fn<(action: string) => boolean>(() => true) },
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("@/api", () => ({
  getCandidate,
  getCandidateCvDocument,
  listCandidateCvDocuments,
  downloadCandidateCV,
  updateCandidateParsedProfile,
}));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CvReview, CvReviewAccess } from "./cv-review";

const alex = mockCandidates[0];
const cv = mockCvDocuments[0];
const olderCv = mockCvDocuments[3];
const parsed = alex.parsed_data as unknown as ParsedCV;

const ok = <T,>(data: T) => ({ data, response: { status: 200 } });
const fail = (status: number, body: unknown) => ({
  data: undefined,
  error: body,
  response: { status },
});
const saved = (patchedData: ParsedCV = parsed) =>
  ok({
    candidate_id: alex.id,
    parsed_data: patchedData,
    reviewed_by: "user-1",
    reviewed_at: "2026-11-02T10:00:00Z",
  });

let user: ReturnType<typeof userEvent.setup>;

const renderReview = async (cvId = cv.id) => {
  render(<CvReview candidateId={alex.id} cvId={cvId} />);
  await screen.findByRole("heading", { name: "Review parsed CV" });
};

beforeEach(() => {
  user = userEvent.setup();
  session.can.mockImplementation(() => true);
  getCandidate.mockResolvedValue(ok(alex));
  getCandidateCvDocument.mockResolvedValue(ok(cv));
  listCandidateCvDocuments.mockResolvedValue(ok([cv, olderCv]));
  downloadCandidateCV.mockResolvedValue(ok(new Blob(["%PDF-1.4"], { type: "application/pdf" })));
  updateCandidateParsedProfile.mockImplementation(async () => saved());
  URL.createObjectURL = vi.fn(() => "blob:cv");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the split screen", () => {
  it("shows the original PDF next to the form", async () => {
    await renderReview();

    const frame = await screen.findByTitle("Original CV: alex-mercer.pdf");
    expect(frame).toHaveAttribute("src", "blob:cv");
    expect(downloadCandidateCV).toHaveBeenCalledWith(alex.id, cv.id);
    expect(screen.getByRole("form", { name: "Parsed fields" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Alex Mercer");
    expect(screen.getByLabelText("Skill 1 as written")).toHaveValue("Python");
  });

  it("offers a way to retry when the PDF cannot be loaded", async () => {
    downloadCandidateCV.mockResolvedValueOnce(fail(404, { detail: "missing" }));
    await renderReview();

    expect(await screen.findByText("The original file could not be found.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTitle("Original CV: alex-mercer.pdf")).toBeInTheDocument();
  });

  it("credits ESCO next to the skill names", async () => {
    await renderReview();
    expect(screen.getByRole("link", { name: /ESCO \(European Skills/ })).toHaveAttribute(
      "href",
      "https://esco.ec.europa.eu"
    );
  });

  it("warns when this is not the candidate's latest CV", async () => {
    getCandidateCvDocument.mockResolvedValue(ok(olderCv));
    await renderReview(olderCv.id);
    expect(screen.getByText(/isn't the candidate's latest CV/)).toBeInTheDocument();
  });

  it("does not warn for the latest CV", async () => {
    await renderReview();
    expect(screen.queryByText(/latest CV/)).not.toBeInTheDocument();
  });
});

describe("states that cannot be reviewed", () => {
  it("explains a CV that has not been parsed", async () => {
    getCandidateCvDocument.mockResolvedValue(ok({ ...cv, status: "extracted" }));
    render(<CvReview candidateId={alex.id} cvId={cv.id} />);
    expect(await screen.findByText("This CV isn't ready for review")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("refuses a profile that is not valid L-10", async () => {
    getCandidate.mockResolvedValue(ok({ ...alex, parsed_data: { skills: ["Python"] } }));
    render(<CvReview candidateId={alex.id} cvId={cv.id} />);
    expect(await screen.findByText("This profile can't be reviewed yet")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("shows not-found for an unknown CV", async () => {
    getCandidateCvDocument.mockResolvedValue(fail(404, { detail: "nope" }));
    render(<CvReview candidateId={alex.id} cvId="missing" />);
    expect(await screen.findByText("CV not found")).toBeInTheDocument();
  });
});

describe("low-confidence fields", () => {
  it("highlights them in words, and only them", async () => {
    await renderReview();

    expect(screen.getByLabelText("Phone")).toHaveAccessibleDescription(/Low confidence \(50%\)/);
    expect(screen.getByLabelText("Skill 4 standard name")).toHaveAccessibleDescription(
      /Low confidence \(62%\)/
    );
    expect(screen.getAllByLabelText("Start (YYYY-MM)")[0]).toHaveAccessibleDescription(
      /Low confidence \(70%\)/
    );
    // High confidence, and a value with no confidence entry at all, are not warnings.
    expect(screen.getByLabelText("Email")).not.toHaveAccessibleDescription(/Low confidence/);
    expect(screen.getByLabelText("Location")).not.toHaveAccessibleDescription(/Low confidence/);
  });

  it("lists them and jumps to a field from the list", async () => {
    await renderReview();

    expect(screen.getByText("3 fields to check")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Contact · phone · 50%" }));
    expect(screen.getByLabelText("Phone")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Skill 4 · standard name · 62%" }));
    expect(screen.getByLabelText("Skill 4 standard name")).toHaveFocus();
  });

  it("keeps the highlight on the right row after another row is removed", async () => {
    await renderReview();

    await user.click(screen.getByRole("button", { name: "Remove Skill 1: Python" }));

    // The saved fourth skill is now the third row.
    expect(screen.getByLabelText("Skill 3 standard name")).toHaveAccessibleDescription(
      /Low confidence \(62%\)/
    );
    expect(screen.getByLabelText("Skill 4 standard name")).not.toHaveAccessibleDescription(
      /Low confidence/
    );
  });
});

describe("saving", () => {
  it("sends only what changed", async () => {
    await renderReview();

    await user.clear(screen.getByLabelText("Headline"));
    await user.type(screen.getByLabelText("Headline"), "Staff Engineer");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(updateCandidateParsedProfile).toHaveBeenCalledTimes(1));
    expect(updateCandidateParsedProfile).toHaveBeenCalledWith(alex.id, {
      headline: "Staff Engineer",
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("is clean after saving, and then offers to confirm", async () => {
    updateCandidateParsedProfile.mockImplementation(async () =>
      saved({ ...parsed, headline: "Staff Engineer", source: "recruiter" })
    );
    await renderReview();

    await user.clear(screen.getByLabelText("Headline"));
    await user.type(screen.getByLabelText("Headline"), "Staff Engineer");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByRole("button", { name: "Confirm as correct" })).toBeInTheDocument();
    expect(screen.getByLabelText("Headline")).toHaveValue("Staff Engineer");
    expect(screen.getByText(/Last reviewed/)).toBeInTheDocument();
  });

  it("records a review with an empty patch when nothing was changed", async () => {
    await renderReview();

    await user.click(screen.getByRole("button", { name: "Confirm as correct" }));

    await waitFor(() => expect(updateCandidateParsedProfile).toHaveBeenCalledWith(alex.id, {}));
  });

  it("saves with Ctrl+S", async () => {
    await renderReview();

    await user.type(screen.getByLabelText("Headline"), "!");
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => expect(updateCandidateParsedProfile).toHaveBeenCalledTimes(1));
  });

  it("puts a field error from the server next to its field", async () => {
    updateCandidateParsedProfile.mockResolvedValue(
      fail(409, {
        detail: [
          {
            loc: ["body", "contact", "email"],
            msg: "A candidate with this email already exists.",
            type: "value_error",
          },
        ],
      })
    );
    await renderReview();

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "taken@example.com");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    const email = screen.getByLabelText("Email");
    expect(await screen.findByText("A candidate with this email already exists.")).toBeVisible();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(toast.error).toHaveBeenCalled();
    // Still dirty: nothing was lost.
    expect(screen.getByRole("button", { name: "Save corrections" })).toBeInTheDocument();
  });

  it("reports a network failure and keeps the edits", async () => {
    updateCandidateParsedProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    await renderReview();

    await user.type(screen.getByLabelText("Headline"), "!");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Headline")).toHaveValue("Backend Software Engineer!");
  });
});

describe("only schema-valid data can be submitted", () => {
  const cases: [string, string, string, RegExp][] = [
    ["an empty skill", "Skill 1 as written", "", /skill as written/i],
    ["a graduation year out of range", "Graduation year", "1900", /1950 to 2100/],
    ["negative experience", "Years of experience", "-2", /number of years/],
    ["a cleared contact email", "Email", "", /can't be cleared/],
    ["an invalid contact email", "Email", "not-an-email", /valid email/],
  ];

  it.each(cases)("blocks %s", async (_name, label, value, message) => {
    await renderReview();

    const field = screen.getAllByLabelText(label)[0];
    await user.clear(field);
    if (value) await user.type(field, value);
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText("Fix 1 problem to save")).toBeInTheDocument();
    expect(within(screen.getByRole("form")).getAllByText(message).length).toBeGreaterThan(0);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(updateCandidateParsedProfile).not.toHaveBeenCalled();
  });

  it("moves focus to the first invalid field, and the summary jumps to the others", async () => {
    await renderReview();

    await user.clear(screen.getByLabelText("Skill 1 as written"));
    await user.clear(screen.getByLabelText("Graduation year"));
    await user.type(screen.getByLabelText("Graduation year"), "1900");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText("Fix 2 problems to save")).toBeInTheDocument();
    // The form library moves focus a moment after the errors render, so wait for it.
    await waitFor(() => expect(screen.getByLabelText("Skill 1 as written")).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /Education 1 · graduation year/ }));
    expect(screen.getByLabelText("Graduation year")).toHaveFocus();
    expect(updateCandidateParsedProfile).not.toHaveBeenCalled();
  });

  it("lets the error go once the value is fixed", async () => {
    await renderReview();

    const skill = screen.getByLabelText("Skill 1 as written");
    await user.clear(skill);
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    expect(await screen.findByText("Fix 1 problem to save")).toBeInTheDocument();

    await user.type(skill, "Python 3");
    await waitFor(() =>
      expect(screen.queryByText(/Fix \d+ problems? to save/)).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    await waitFor(() => expect(updateCandidateParsedProfile).toHaveBeenCalledTimes(1));
  });
});

describe("focus after a failed save", () => {
  // The form library moves focus to the problem field while the form still counts as "submitting",
  // and a disabled input ignores `.focus()`. So the fields must not be locked while the form is only
  // being validated. These run with zero-delay timeouts firing ahead of React, which is what a slow CI
  // runner does and a fast PC usually doesn't: without the fix the button kept the focus.
  const timeoutsAheadOfReact = () => {
    const real = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      if (!ms) {
        queueMicrotask(() => fn());
        return 0;
      }
      return real(fn as never, ms, ...(rest as []));
    }) as unknown as typeof setTimeout);
    return { spy, real };
  };

  it("puts focus on the first invalid field, even when React is slow to re-render", async () => {
    const { spy, real } = timeoutsAheadOfReact();
    try {
      await renderReview();
      await user.clear(screen.getByLabelText("Skill 1 as written"));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));
      await screen.findByText("Fix 1 problem to save");
      await new Promise((resolve) => real(resolve, 300));

      expect(screen.getByLabelText("Skill 1 as written")).toHaveFocus();
    } finally {
      spy.mockRestore();
    }
  });

  it("puts focus on the field a server error is about (a taken email)", async () => {
    updateCandidateParsedProfile.mockResolvedValue(
      fail(409, {
        detail: [
          {
            loc: ["body", "contact", "email"],
            msg: "A candidate with this email already exists.",
            type: "value_error",
          },
        ],
      })
    );
    await renderReview();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "taken@example.com");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    await screen.findByText("A candidate with this email already exists.");

    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
  });

  it("still locks the fields while a valid save is in flight, and unlocks them after", async () => {
    let finish!: (value: unknown) => void;
    updateCandidateParsedProfile.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(screen.getByLabelText("Headline")).toBeDisabled());
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    finish(saved());
    await waitFor(() => expect(screen.getByLabelText("Headline")).toBeEnabled());
  });

  it("unlocks the fields again after a network failure, with the edits kept", async () => {
    updateCandidateParsedProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Headline")).toBeEnabled());
    expect(screen.getByLabelText("Headline")).toHaveValue("Backend Software Engineer!");
  });
});

describe("read-only for roles that cannot edit", () => {
  beforeEach(() => {
    session.can.mockImplementation((action: string) => action !== "candidate:write");
  });

  it("shows the values but disables every control and hides the actions", async () => {
    await renderReview();

    expect(screen.getByText(/your role can't change them/)).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Parsed fields" });
    const controls = within(form).getAllByRole("textbox");
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) expect(control).toBeDisabled();
    for (const box of within(form).getAllByRole("checkbox")) expect(box).toBeDisabled();

    expect(screen.getByLabelText("Name")).toHaveValue("Alex Mercer");
    expect(screen.queryByRole("button", { name: "Save corrections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm as correct" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add skill" })).not.toBeInTheDocument();
    // Row remove buttons are gone; the tag chips' own buttons stay but cannot be used.
    expect(
      screen.queryByRole("button", { name: /^Remove (Skill|Experience|Education|Language)/ })
    ).not.toBeInTheDocument();
    for (const button of screen.queryAllByRole("button", { name: /^Remove/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("still shows the PDF and the fields to check", async () => {
    await renderReview();
    expect(await screen.findByTitle("Original CV: alex-mercer.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 fields to check")).toBeInTheDocument();
  });

  it("never sends anything, not even with Ctrl+S, and never warns about leaving", async () => {
    await renderReview();

    screen.getByLabelText("Name").focus();
    await user.keyboard("{Control>}s{/Control}");
    expect(updateCandidateParsedProfile).not.toHaveBeenCalled();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("unsaved changes", () => {
  it("holds back a link click, and lets the user keep editing", async () => {
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");

    await user.click(screen.getAllByRole("link", { name: "Back to candidate" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    expect(router.push).not.toHaveBeenCalled();
    // The safe choice has the focus (the dialog moves it there just after it opens).
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus()
    );

    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Headline")).toHaveValue("Backend Software Engineer!");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("leaves after the user chooses to discard", async () => {
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");

    await user.click(screen.getAllByRole("link", { name: "Back to candidate" })[0]);
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));

    expect(router.push).toHaveBeenCalledWith(`/candidates/${alex.id}`);
  });

  it("closes with Escape as 'keep editing', from the keyboard alone", async () => {
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");

    screen.getAllByRole("link", { name: "Back to candidate" })[0].focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("asks the browser before closing or reloading the tab, only while dirty", async () => {
    await renderReview();

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText("Headline"), "!");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("does not interrupt a link when nothing has changed", async () => {
    await renderReview();
    const link = screen.getAllByRole("link", { name: "Back to candidate" })[0];
    // Stop the click here so jsdom does not try to navigate.
    link.addEventListener("click", (event) => event.preventDefault());

    await user.click(link);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops warning once the changes are saved", async () => {
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    await screen.findByRole("button", { name: "Confirm as correct" });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("resets to what was saved", async () => {
    await renderReview();
    await user.type(screen.getByLabelText("Headline"), "!");

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Headline")).toHaveValue("Backend Software Engineer");
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });
});

describe("keyboard use", () => {
  it("offers skip links to both panes", async () => {
    await renderReview();
    const nav = screen.getByRole("navigation", { name: "Skip links" });
    expect(within(nav).getByRole("link", { name: "Skip to corrections" })).toHaveAttribute(
      "href",
      "#cv-corrections"
    );
    expect(within(nav).getByRole("link", { name: "Skip to the original CV" })).toHaveAttribute(
      "href",
      "#cv-original"
    );
  });

  it("adds a skill and puts focus in it", async () => {
    await renderReview();

    screen.getByRole("button", { name: "Add skill" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Skill 7 as written")).toHaveFocus();
    await user.keyboard("Rust");
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => expect(updateCandidateParsedProfile).toHaveBeenCalledTimes(1));
    const patch = updateCandidateParsedProfile.mock.calls[0][1];
    expect(patch.skills.at(-1)).toEqual({ raw: "Rust", normalized: null });
  });

  it("moves focus sensibly after removing a row", async () => {
    await renderReview();

    // Not the last row: the row that takes its place gets the focus.
    screen.getByRole("button", { name: "Remove Skill 2: FastAPI" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Skill 2 as written")).toHaveValue("PostgreSQL");
    expect(screen.getByLabelText("Skill 2 as written")).toHaveFocus();

    // The last row: the one before it.
    screen.getByRole("button", { name: "Remove Skill 5: Docker" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Skill 4 as written")).toHaveFocus();
  });

  it("returns focus to the add button when the list is emptied", async () => {
    getCandidate.mockResolvedValue(
      ok({
        ...alex,
        parsed_data: { ...parsed, languages: [{ language: "English", level: "native" }] },
      })
    );
    await renderReview();

    screen.getByRole("button", { name: "Remove Language 1: English" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Add language" })).toHaveFocus();
  });

  it("toggles the current-position checkbox with Space", async () => {
    await renderReview();

    const box = screen.getAllByLabelText("Current position")[0];
    expect(box).toBeChecked();
    box.focus();
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
  });

  it("reaches every action in the tab order without a pointer", async () => {
    await renderReview();

    // Tabbing from the top reaches the save button, all via native controls.
    const stops = new Set<string>();
    for (let i = 0; i < 150 && !stops.has("Confirm as correct"); i += 1) {
      await user.tab();
      const active = document.activeElement as HTMLElement;
      stops.add(active.getAttribute("aria-label") ?? active.textContent?.trim() ?? active.tagName);
    }
    expect(stops.has("Confirm as correct")).toBe(true);
    expect(stops.has("Skip to corrections")).toBe(true);
    expect(stops.has("Add skill")).toBe(true);
  }, 60_000);
});

describe("CvReviewAccess", () => {
  it("lets every role with the permission in", () => {
    render(
      <CvReviewAccess>
        <p>inside</p>
      </CvReviewAccess>
    );
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("keeps out a role without it", () => {
    session.can.mockImplementation(() => false);
    render(
      <CvReviewAccess>
        <p>inside</p>
      </CvReviewAccess>
    );
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
    expect(screen.getByText("You don't have access to CV review")).toBeInTheDocument();
  });
});
