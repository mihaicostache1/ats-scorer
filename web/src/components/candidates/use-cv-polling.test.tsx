import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { mockCvDocuments } from "@/mocks/fixtures/candidates";
import type { CvDocument } from "./cv-status";

const { getCandidateCvDocument } = vi.hoisted(() => ({ getCandidateCvDocument: vi.fn() }));
vi.mock("@/api", () => ({ getCandidateCvDocument }));

import { nextDelay, POLL_BUDGET_MS, POLL_MAX_FAILURES, useCvPolling } from "./use-cv-polling";

const base = mockCvDocuments[0];
const doc = (status: CvDocument["status"]): CvDocument => ({ ...base, status });
const ok = (data: CvDocument) => ({ data, response: { status: 200 } });
const serverError = { data: undefined, error: {}, response: { status: 500 } };

/** Plays the part of the CV row: keeps the document in state, and shows what the hook reports. */
function Harness({ initial }: { initial: CvDocument }) {
  const [cv, setCv] = React.useState(initial);
  const { pollState, checkNow } = useCvPolling({
    candidateId: "cand-1",
    cv,
    onUpdate: (next) => setCv(next),
  });
  return (
    <>
      <output data-testid="state">{`${pollState}:${cv.status}`}</output>
      <button onClick={checkNow}>check now</button>
    </>
  );
}

const state = () => screen.getByTestId("state").textContent;
/** Moves the clock and lets the promises it triggers settle. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  getCandidateCvDocument.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("nextDelay", () => {
  it("backs off by half again each time, up to 8 seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(nextDelay)).toEqual([
      1000, 1500, 2250, 3375, 5063, 7594, 8000, 8000, 8000,
    ]);
  });
});

describe("useCvPolling", () => {
  it("asks on a backoff schedule and stops at the first final status", async () => {
    getCandidateCvDocument
      .mockResolvedValueOnce(ok(doc("extracting")))
      .mockResolvedValueOnce(ok(doc("parsed")));
    render(<Harness initial={doc("queued")} />);
    expect(state()).toBe("polling:queued");

    await advance(999);
    expect(getCandidateCvDocument).not.toHaveBeenCalled();
    await advance(1);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
    expect(getCandidateCvDocument).toHaveBeenCalledWith("cand-1", base.id);
    expect(state()).toBe("polling:extracting");

    await advance(1499); // the second wait is 1.5 s
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(2);
    expect(state()).toBe("idle:parsed");

    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(2);
  });

  it.each(["extracted", "needs_review", "failed"] as const)("stops on %s", async (status) => {
    getCandidateCvDocument.mockResolvedValue(ok(doc(status)));
    render(<Harness initial={doc("queued")} />);
    await advance(1000);
    expect(state()).toBe(`idle:${status}`);
    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
  });

  it("does not ask at all for a CV that is already in a final state", async () => {
    render(<Harness initial={doc("parsed")} />);
    await advance(60_000);
    expect(getCandidateCvDocument).not.toHaveBeenCalled();
    expect(state()).toBe("idle:parsed");
  });

  it("tells the caller what it replaced", async () => {
    getCandidateCvDocument.mockResolvedValue(ok(doc("parsed")));
    const onUpdate = vi.fn();
    function Spy() {
      useCvPolling({ candidateId: "c", cv: doc("queued"), onUpdate });
      return null;
    }
    render(<Spy />);
    await advance(1000);
    expect(onUpdate).toHaveBeenCalledWith(doc("parsed"), doc("queued"));
  });

  it("stops when the page is left, even with a request in flight", async () => {
    getCandidateCvDocument.mockResolvedValue(ok(doc("extracting")));
    const { unmount } = render(<Harness initial={doc("queued")} />);
    await advance(1000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);

    unmount();
    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
  });

  it("ignores an answer that arrives after the page was left", async () => {
    let answer!: (value: unknown) => void;
    getCandidateCvDocument.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const onUpdate = vi.fn();
    function Spy() {
      useCvPolling({ candidateId: "c", cv: doc("queued"), onUpdate });
      return null;
    }
    const { unmount } = render(<Spy />);
    await advance(1000);
    unmount();
    await act(async () => answer(ok(doc("parsed"))));
    await advance(60_000);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
  });

  it("stops when the CV no longer exists", async () => {
    getCandidateCvDocument.mockResolvedValue({
      data: undefined,
      error: {},
      response: { status: 404 },
    });
    render(<Harness initial={doc("queued")} />);
    await advance(1000);
    expect(state()).toBe("gone:queued");
    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps trying through a few failures, then reports the connection as lost", async () => {
    getCandidateCvDocument.mockResolvedValue(serverError);
    render(<Harness initial={doc("queued")} />);

    // 1 + 1.5 + 2.25 + 3.375 s, then the fifth attempt gives up.
    await advance(1000 + 1500 + 2250 + 3375);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(POLL_MAX_FAILURES - 1);
    expect(state()).toBe("polling:queued");
    await advance(5063);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(POLL_MAX_FAILURES);
    expect(state()).toBe("lost:queued");

    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(POLL_MAX_FAILURES);
  });

  it("counts only failures in a row", async () => {
    getCandidateCvDocument
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(ok(doc("extracting")))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(ok(doc("parsed")));
    render(<Harness initial={doc("queued")} />);
    await advance(60_000);
    expect(state()).toBe("idle:parsed");
  });

  it("can be started again after losing the connection", async () => {
    getCandidateCvDocument.mockResolvedValue(serverError);
    render(<Harness initial={doc("queued")} />);
    await advance(60_000);
    expect(state()).toBe("lost:queued");

    getCandidateCvDocument.mockReset();
    getCandidateCvDocument.mockResolvedValue(ok(doc("parsed")));
    await act(async () => screen.getByText("check now").click());
    await advance(1000);
    expect(state()).toBe("idle:parsed");
  });

  it("gives up after the time budget instead of asking forever", async () => {
    getCandidateCvDocument.mockResolvedValue(ok(doc("extracting")));
    render(<Harness initial={doc("queued")} />);

    await advance(POLL_BUDGET_MS + 10_000);
    expect(state()).toBe("timed-out:extracting");
    const calls = getCandidateCvDocument.mock.calls.length;
    expect(calls).toBeGreaterThan(50);

    await advance(60_000);
    expect(getCandidateCvDocument).toHaveBeenCalledTimes(calls);
  });
});
