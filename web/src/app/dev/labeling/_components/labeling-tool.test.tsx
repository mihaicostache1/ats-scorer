import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { downloadTextFile, toast } = vi.hoisted(() => ({
  downloadTextFile: vi.fn(),
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));
vi.mock("../_lib/download", () => ({ downloadTextFile }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { exportRatingsCsv } from "../_lib/csv";
import type { LabelingData, Rating } from "../_lib/types";
import { LabelingTool } from "./labeling-tool";

const job = (id: string, title: string) => ({
  id,
  title,
  department: "Engineering",
  location: "Bucharest",
  employment_type: "full_time",
  description: `Description of ${title}.`,
  required_skills: ["Python"],
  preferred_skills: ["Go"],
  min_experience_years: 3,
});

const data: LabelingData = {
  datasetId: "ds1",
  pairs: [
    { candidateId: "C001", jobId: "J01" },
    { candidateId: "C002", jobId: "J01" },
    { candidateId: "C003", jobId: "J07" },
    { candidateId: "C001", jobId: "J07" },
  ],
  jobs: { J01: job("J01", "Backend Engineer"), J07: job("J07", "Data Analyst") },
};

const RATER_KEY = "ats-scorer:labeling:rater";
const PROGRESS_KEY = "ats-scorer:labeling:v1:ana";
const stored = () => JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
const progressText = () => screen.getByTestId("labeling-progress").textContent;
const frame = () => screen.getByTitle(/^CV of candidate/) as HTMLIFrameElement;

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  localStorage.setItem(RATER_KEY, "Ana");
});
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("getting started", () => {
  it("asks for a name first, and does not take a rating without one", async () => {
    localStorage.clear();
    render(<LabelingTool data={data} />);

    expect(screen.getByText("Enter your name to start")).toBeInTheDocument();
    await user.keyboard("3");
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(screen.queryByTitle(/^CV of candidate/)).not.toBeInTheDocument();
  });

  it("shows the first pair, side by side, once there is a name", async () => {
    localStorage.clear();
    render(<LabelingTool data={data} />);

    await user.type(screen.getByLabelText("Your name"), "Ana Maria");

    expect(screen.getByText(/ana-maria\.csv/)).toBeInTheDocument();
    expect(frame()).toHaveAttribute("src", "/dev/labeling/pdf/C001#view=FitH");
    expect(screen.getByRole("heading", { name: "Backend Engineer" })).toBeInTheDocument();
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });

  it("hands the keyboard back to the shortcuts when Enter is pressed in the name box", async () => {
    render(<LabelingTool data={data} />);

    await user.click(screen.getByLabelText("Your name"));
    await user.keyboard("2");
    // Typed into the box (the name is now "Ana2"), not taken as a rating.
    expect(screen.getByLabelText("Your name")).toHaveValue("Ana2");
    expect(localStorage.getItem("ats-scorer:labeling:v1:ana2")).toBeNull();

    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Your name")).not.toHaveFocus();
    await user.keyboard("3");
    expect(JSON.parse(localStorage.getItem("ats-scorer:labeling:v1:ana2")!).ratings).toEqual({
      "C001|J01": 3,
    });
  });

  it("marks the page as dev only", () => {
    render(<LabelingTool data={data} />);
    expect(screen.getByText("Dev only")).toBeInTheDocument();
  });
});

describe("rating with the keyboard", () => {
  it.each<Rating>([0, 1, 2, 3])("rates with %i and moves to the next pair", async (value) => {
    render(<LabelingTool data={data} />);

    await user.keyboard(String(value));

    expect(stored().ratings).toEqual({ "C001|J01": value });
    expect(progressText()).toBe("Pair 2 of 4 · 1 rated · 0 skipped");
    expect(frame()).toHaveAttribute("src", "/dev/labeling/pdf/C002#view=FitH");
  });

  it("also rates with the buttons", async () => {
    render(<LabelingTool data={data} />);
    await user.click(screen.getByRole("button", { name: /^2 · Good fit/ }));
    expect(stored().ratings).toEqual({ "C001|J01": 2 });
  });

  it("ignores keys that are not shortcuts, and 4", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("4xyz{Enter}");
    expect(stored()).toBeNull();
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });

  it("ignores a key that is held down, so it cannot rate every pair", async () => {
    render(<LabelingTool data={data} />);

    fireEvent.keyDown(document.body, { key: "3" });
    fireEvent.keyDown(document.body, { key: "3", repeat: true });
    fireEvent.keyDown(document.body, { key: "3", repeat: true });

    expect(stored().ratings).toEqual({ "C001|J01": 3 });
  });

  it("does not rate while typing in the name box", async () => {
    render(<LabelingTool data={data} />);

    await user.type(screen.getByLabelText("Your name"), "2s1u0");

    expect(stored()).toBeNull();
    expect(screen.getByLabelText("Your name")).toHaveValue("Ana2s1u0");
  });

  it("announces what happened, for screen readers", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3");
    expect(
      screen.getByText(/Rated candidate C001 for job J01: 3\. Now showing candidate C002/)
    ).toBeInTheDocument();
  });

  it("shows a pair's rating when it is visited again", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3");
    await user.keyboard("{ArrowLeft}");

    expect(screen.getByText(/Rated 3 · Strong fit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^3 · Strong fit/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /^1 · Weak fit/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});

describe("skip and undo", () => {
  it("skips without a rating and moves on", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("s");

    expect(stored().ratings).toEqual({});
    expect(stored().skipped).toEqual(["C001|J01"]);
    expect(progressText()).toBe("Pair 2 of 4 · 0 rated · 1 skipped");
  });

  it("shows that a pair was skipped when it is visited again", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("s{ArrowLeft}");
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });

  it("skips with the button", async () => {
    render(<LabelingTool data={data} />);
    await user.click(screen.getByRole("button", { name: /^Skip/ }));
    expect(stored().skipped).toEqual(["C001|J01"]);
  });

  it("undoes a rating, and goes back to that pair", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3u");

    expect(stored().ratings).toEqual({});
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
    expect(frame()).toHaveAttribute("src", "/dev/labeling/pdf/C001#view=FitH");
  });

  it("undoes several actions in a row, with U, Backspace and Ctrl+Z", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3s2");
    expect(progressText()).toBe("Pair 4 of 4 · 2 rated · 1 skipped");

    await user.keyboard("u");
    expect(progressText()).toBe("Pair 3 of 4 · 1 rated · 1 skipped");
    await user.keyboard("{Backspace}");
    expect(progressText()).toBe("Pair 2 of 4 · 1 rated · 0 skipped");
    await user.keyboard("{Control>}z{/Control}");
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });

  it("does nothing, and says nothing, with nothing to undo", async () => {
    render(<LabelingTool data={data} />);
    expect(screen.getByRole("button", { name: /^Undo/ })).toBeDisabled();
    await user.keyboard("u");
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });

  it("restores an earlier rating when a pair that was re-rated is undone", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("1{ArrowLeft}3");
    expect(stored().ratings["C001|J01"]).toBe(3);

    await user.keyboard("u");
    expect(stored().ratings["C001|J01"]).toBe(1);
  });

  it("undoes with the button", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3");
    await user.click(screen.getByRole("button", { name: /^Undo/ }));
    expect(stored().ratings).toEqual({});
  });
});

describe("browsing", () => {
  it("moves between pairs without changing a rating", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3");
    const before = stored().ratings;

    await user.keyboard("{ArrowRight}{ArrowLeft}{ArrowLeft}");
    await user.click(screen.getByRole("button", { name: /^Next/ }));
    await user.click(screen.getByRole("button", { name: /^Previous/ }));

    expect(stored().ratings).toEqual(before);
  });

  it("stops at the first pair", async () => {
    render(<LabelingTool data={data} />);
    expect(screen.getByRole("button", { name: /^Previous/ })).toBeDisabled();
    await user.keyboard("{ArrowLeft}");
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });
});

describe("progress survives a reload", () => {
  it("restores ratings, skips and the position", async () => {
    const { unmount } = render(<LabelingTool data={data} />);
    await user.keyboard("3s2");
    unmount();

    render(<LabelingTool data={data} />);
    expect(progressText()).toBe("Pair 4 of 4 · 2 rated · 1 skipped");
    expect(frame()).toHaveAttribute("src", "/dev/labeling/pdf/C001#view=FitH");
  });

  it("keeps the undo history, so undo works after the reload", async () => {
    const { unmount } = render(<LabelingTool data={data} />);
    await user.keyboard("3s");
    unmount();

    render(<LabelingTool data={data} />);
    await user.keyboard("u");
    expect(progressText()).toBe("Pair 2 of 4 · 1 rated · 0 skipped");
    await user.keyboard("u");
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });

  it("keeps each rater's progress apart", async () => {
    const { unmount } = render(<LabelingTool data={data} />);
    await user.keyboard("3");
    unmount();

    localStorage.setItem(RATER_KEY, "Bob");
    render(<LabelingTool data={data} />);
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
    expect(localStorage.getItem("ats-scorer:labeling:v1:ana")).not.toBeNull();
  });

  it("starts fresh from saved data it cannot read", () => {
    localStorage.setItem(PROGRESS_KEY, "{broken");
    render(<LabelingTool data={data} />);
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });

  it("does not apply ratings made on another version of the evaluation set", async () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        datasetId: "an-older-version",
        ratings: { "C001|J01": 3, "C002|J01": 1 },
        skipped: [],
        history: [],
        cursor: 2,
      })
    );
    render(<LabelingTool data={data} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("another version of the evaluation set");
    expect(alert).toHaveTextContent("2 ratings were saved");
    expect(screen.queryByTitle(/^CV of candidate/)).not.toBeInTheDocument();
    await user.keyboard("3");
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!).datasetId).toBe("an-older-version");

    await user.click(screen.getByRole("button", { name: "Download the old ratings" }));
    expect(downloadTextFile).toHaveBeenCalledWith(
      "ana-previous-version.csv",
      "candidate_id,job_id,rating\nC001,J01,3\nC002,J01,1\n"
    );
    // Nothing was thrown away by downloading.
    expect(localStorage.getItem(PROGRESS_KEY)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(progressText()).toBe("Pair 1 of 4 · 0 rated · 0 skipped");
  });
});

describe("export", () => {
  it("downloads <name>.csv in the format L-9 reads, and warns that some pairs are empty", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3s1");
    await user.keyboard("e");

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [fileName, text] = downloadTextFile.mock.calls[0];
    expect(fileName).toBe("ana.csv");
    expect(text).toBe(exportRatingsCsv(data.pairs, { "C001|J01": 3, "C003|J07": 1 }));
    expect(text).toBe("candidate_id,job_id,rating\nC001,J01,3\nC002,J01,\nC003,J07,1\nC001,J07,\n");
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("2 of 4 pairs are rated"),
      "Exported"
    );
  });

  it("exports with the button, too", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("2");
    await user.click(screen.getByRole("button", { name: /^Export CSV/ }));
    expect(downloadTextFile).toHaveBeenCalledWith("ana.csv", expect.stringContaining("C001,J01,2"));
  });

  it("says so when it exports an empty template", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("e");
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("only the empty template"),
      "Exported"
    );
  });

  it("is a success when every pair is rated", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3210e");
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("All 4 pairs are rated"),
      "Exported"
    );
  });

  it("needs a name, since the name is the file name", async () => {
    localStorage.clear();
    render(<LabelingTool data={data} />);
    await user.keyboard("e");
    expect(downloadTextFile).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Export CSV/ })).toBeDisabled();
  });
});

describe("after the last pair", () => {
  it("shows a summary, and goes back to the pairs without a rating", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3s2s");

    expect(screen.getByRole("heading", { name: "All pairs seen" })).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 rated, 2 still without a rating/)).toBeInTheDocument();
    expect(screen.queryByTitle(/^CV of candidate/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review the 2 unrated" }));
    expect(progressText()).toBe("Pair 2 of 4 · 2 rated · 2 skipped");
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });

  it("offers the export, with the file it would write", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3210");
    await user.click(screen.getByRole("button", { name: "Export ana.csv" }));
    expect(downloadTextFile).toHaveBeenCalledWith("ana.csv", expect.any(String));
    expect(screen.queryByRole("button", { name: /Review the/ })).not.toBeInTheDocument();
  });

  it("undo steps back out of the summary", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("3210u");
    expect(progressText()).toBe("Pair 4 of 4 · 3 rated · 0 skipped");
  });
});

describe("help", () => {
  it("opens with ? and closes with Escape", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("?");

    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText(/Rate the pair and move to the next one/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not rate while it is open", async () => {
    render(<LabelingTool data={data} />);
    await user.keyboard("?");
    await screen.findByRole("dialog");

    await user.keyboard("3s");
    expect(stored()).toBeNull();
  });
});
