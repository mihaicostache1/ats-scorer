import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { rate } from "./progress";
import { useLabelingState } from "./store";
import type { LabelingData } from "./types";

/**
 * This file only covers a browser that refuses to store anything (some private windows, blocked
 * site data). The store remembers that fact for the life of the page, so it gets a file of its own;
 * the normal case is covered by `_components/labeling-tool.test.tsx`.
 */

const data: LabelingData = {
  datasetId: "ds1",
  pairs: [
    { candidateId: "C001", jobId: "J01" },
    { candidateId: "C002", jobId: "J01" },
  ],
  jobs: {},
};

beforeEach(() => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("when localStorage cannot be written", () => {
  it("warns, and keeps the session working in memory", () => {
    const { result } = renderHook(() => useLabelingState(data));

    expect(result.current.ready).toBe(true);
    expect(result.current.storageWarning).toBe(true);

    act(() => result.current.setRater("Ana"));
    expect(result.current.rater).toBe("Ana");
    expect(result.current.slug).toBe("ana");
    expect(result.current.progress?.cursor).toBe(0);

    act(() => result.current.update((progress) => rate(progress, data.pairs, 3)));
    expect(result.current.progress?.ratings).toEqual({ "C001|J01": 3 });
    expect(result.current.progress?.cursor).toBe(1);
  });

  it("does not need a rater to read, and takes no rating without one", () => {
    const { result } = renderHook(() => useLabelingState(data));
    act(() => result.current.setRater(""));
    expect(result.current.progress).toBeNull();
    act(() => result.current.update((progress) => rate(progress, data.pairs, 3)));
    expect(result.current.progress).toBeNull();
  });
});
