import { describe, expect, it } from "vitest";
import {
  counts,
  emptyProgress,
  firstUnrated,
  goTo,
  jobProgress,
  parseStoredProgress,
  rate,
  serializeProgress,
  skip,
  stateOf,
  undo,
  type Progress,
} from "./progress";
import type { Pair } from "./types";

const pairs: Pair[] = [
  { candidateId: "C001", jobId: "J01" },
  { candidateId: "C002", jobId: "J01" },
  { candidateId: "C003", jobId: "J01" },
  { candidateId: "C001", jobId: "J07" },
];
const K = ["C001|J01", "C002|J01", "C003|J01", "C001|J07"];
const DATASET = "abc123";
const fresh = () => emptyProgress(DATASET);

describe("rate", () => {
  it("stores the rating and moves to the next pair", () => {
    const next = rate(fresh(), pairs, 3);
    expect(next.ratings).toEqual({ [K[0]]: 3 });
    expect(next.cursor).toBe(1);
  });

  it("goes to the summary after the last pair", () => {
    let progress = fresh();
    for (let i = 0; i < pairs.length; i += 1) progress = rate(progress, pairs, 2);
    expect(progress.cursor).toBe(pairs.length);
  });

  it("does nothing on the summary", () => {
    let progress = fresh();
    for (let i = 0; i < pairs.length; i += 1) progress = rate(progress, pairs, 2);
    expect(rate(progress, pairs, 0)).toBe(progress);
  });

  it("changes an earlier rating when the rater goes back", () => {
    let progress = rate(fresh(), pairs, 1);
    progress = goTo(progress, pairs, 0);
    progress = rate(progress, pairs, 3);
    expect(progress.ratings[K[0]]).toBe(3);
    expect(progress.cursor).toBe(1);
  });

  it("clears a skip when the pair is rated", () => {
    let progress = skip(fresh(), pairs);
    progress = rate(goTo(progress, pairs, 0), pairs, 2);
    expect(stateOf(progress, K[0])).toBe(2);
    expect(progress.skipped).toEqual([]);
  });

  it("does not change the input", () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    rate(before, pairs, 1);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("skip", () => {
  it("leaves the pair unrated, marks it skipped and moves on", () => {
    const next = skip(fresh(), pairs);
    expect(next.ratings).toEqual({});
    expect(next.skipped).toEqual([K[0]]);
    expect(next.cursor).toBe(1);
  });

  it("never erases an existing rating", () => {
    let progress = rate(fresh(), pairs, 3);
    progress = skip(goTo(progress, pairs, 0), pairs);
    expect(progress.ratings[K[0]]).toBe(3);
    expect(progress.skipped).toEqual([]);
    expect(progress.cursor).toBe(1);
  });

  it("does nothing on the summary", () => {
    const end = goTo(fresh(), pairs, pairs.length);
    expect(skip(end, pairs)).toBe(end);
  });

  it("does not list a pair twice", () => {
    let progress = skip(fresh(), pairs);
    progress = skip(goTo(progress, pairs, 0), pairs);
    expect(progress.skipped).toEqual([K[0]]);
  });
});

describe("undo", () => {
  it("takes back a rating and returns to that pair", () => {
    const rated = rate(fresh(), pairs, 3);
    const back = undo(rated);
    expect(back.ratings).toEqual({});
    expect(back.cursor).toBe(0);
    expect(back.history).toEqual([]);
  });

  it("takes back a skip", () => {
    const back = undo(skip(fresh(), pairs));
    expect(back.skipped).toEqual([]);
    expect(stateOf(back, K[0])).toBeNull();
    expect(back.cursor).toBe(0);
  });

  it("restores the old rating when a pair was re-rated", () => {
    let progress = rate(fresh(), pairs, 1);
    progress = rate(goTo(progress, pairs, 0), pairs, 3);
    expect(progress.ratings[K[0]]).toBe(3);

    progress = undo(progress);
    expect(progress.ratings[K[0]]).toBe(1);
    expect(progress.cursor).toBe(0);
  });

  it("restores a skip when a skipped pair was rated", () => {
    let progress = skip(fresh(), pairs);
    progress = rate(goTo(progress, pairs, 0), pairs, 2);
    progress = undo(progress);
    expect(stateOf(progress, K[0])).toBe("skipped");
  });

  it("goes back through several actions, newest first", () => {
    let progress = fresh();
    progress = rate(progress, pairs, 3); // C001
    progress = skip(progress, pairs); // C002
    progress = rate(progress, pairs, 0); // C003
    expect(progress.cursor).toBe(3);

    progress = undo(progress);
    expect(progress.cursor).toBe(2);
    expect(stateOf(progress, K[2])).toBeNull();
    expect(stateOf(progress, K[1])).toBe("skipped");

    progress = undo(progress);
    expect(progress.cursor).toBe(1);
    expect(stateOf(progress, K[1])).toBeNull();
    expect(stateOf(progress, K[0])).toBe(3);

    progress = undo(progress);
    expect(progress).toEqual(fresh());
  });

  it("works from the summary screen", () => {
    let progress = fresh();
    for (let i = 0; i < pairs.length; i += 1) progress = rate(progress, pairs, 1);
    progress = undo(progress);
    expect(progress.cursor).toBe(pairs.length - 1);
    expect(stateOf(progress, K[3])).toBeNull();
  });

  it("is a no-op with nothing to undo", () => {
    const empty = fresh();
    expect(undo(empty)).toBe(empty);
  });

  it("undoes a skip of a rated pair without touching the rating", () => {
    let progress = rate(fresh(), pairs, 2);
    progress = skip(goTo(progress, pairs, 0), pairs);
    progress = undo(progress);
    expect(progress.ratings[K[0]]).toBe(2);
    expect(progress.cursor).toBe(0);
  });
});

describe("goTo", () => {
  it("moves without changing ratings or history", () => {
    const rated = rate(fresh(), pairs, 2);
    const moved = goTo(rated, pairs, 3);
    expect(moved.cursor).toBe(3);
    expect(moved.ratings).toEqual(rated.ratings);
    expect(moved.history).toEqual(rated.history);
  });

  it("stays within the pairs and the summary", () => {
    expect(goTo(fresh(), pairs, -5).cursor).toBe(0);
    expect(goTo(fresh(), pairs, 99).cursor).toBe(pairs.length);
  });
});

describe("counts and job progress", () => {
  const progress = (): Progress => {
    let p = fresh();
    p = rate(p, pairs, 3);
    p = skip(p, pairs);
    return rate(p, pairs, 1);
  };

  it("counts rated, skipped and unrated", () => {
    expect(counts(progress(), pairs)).toEqual({ total: 4, rated: 2, skipped: 1, unrated: 2 });
  });

  it("counts per job in the order the jobs appear", () => {
    expect(jobProgress(progress(), pairs)).toEqual([
      { jobId: "J01", rated: 2, total: 3 },
      { jobId: "J07", rated: 0, total: 1 },
    ]);
  });

  it("finds the first pair without a rating, skipped or not seen", () => {
    expect(firstUnrated(progress(), pairs)).toBe(1);
    expect(firstUnrated(fresh(), pairs)).toBe(0);
    let all = fresh();
    for (let i = 0; i < pairs.length; i += 1) all = rate(all, pairs, 2);
    expect(firstUnrated(all, pairs)).toBe(-1);
  });
});

describe("parseStoredProgress", () => {
  const saved = () => {
    let p = rate(fresh(), pairs, 3);
    p = skip(p, pairs);
    return p;
  };

  it("reads nothing as nothing", () => {
    expect(parseStoredProgress(null, pairs, DATASET)).toEqual({ kind: "none" });
  });

  it("round-trips what was saved", () => {
    const result = parseStoredProgress(serializeProgress(saved()), pairs, DATASET);
    expect(result).toEqual({ kind: "ok", progress: saved() });
  });

  it.each([
    ["not JSON", "{oops"],
    ["a list", "[]"],
    ["another version", JSON.stringify({ ...saved(), version: 2 })],
    ["no ratings", JSON.stringify({ version: 1, datasetId: DATASET })],
    ["no dataset id", JSON.stringify({ version: 1, ratings: {} })],
  ])("treats %s as corrupt", (_name, raw) => {
    expect(parseStoredProgress(raw, pairs, DATASET)).toEqual({ kind: "corrupt" });
  });

  it("does not apply progress made on another version of the set", () => {
    const other = serializeProgress({ ...saved(), datasetId: "different" });
    expect(parseStoredProgress(other, pairs, DATASET)).toMatchObject({
      kind: "mismatch",
      ratedCount: 1,
    });
  });

  it("drops what does not fit instead of trusting it", () => {
    const raw = JSON.stringify({
      version: 1,
      datasetId: DATASET,
      ratings: {
        [K[0]]: 3,
        [K[1]]: 4,
        [K[2]]: 2.5,
        [K[3]]: "2",
        "C999|J99": 1,
      },
      skipped: [K[1], K[0], "C999|J99", 7],
      history: [
        { pair: K[0], before: null, cursorBefore: 0 },
        { pair: "C999|J99", before: null, cursorBefore: 0 },
        { pair: K[1], before: 9, cursorBefore: 1 },
        { pair: K[1], before: null, cursorBefore: 99 },
        "junk",
      ],
      cursor: 42,
    });
    const result = parseStoredProgress(raw, pairs, DATASET);
    expect(result).toEqual({
      kind: "ok",
      progress: {
        version: 1,
        datasetId: DATASET,
        ratings: { [K[0]]: 3 },
        // K[0] is rated, so it cannot also be skipped.
        skipped: [K[1]],
        history: [{ pair: K[0], before: null, cursorBefore: 0 }],
        cursor: pairs.length,
      },
    });
  });

  it("starts at the first pair when the cursor is not a number", () => {
    const raw = JSON.stringify({ ...saved(), cursor: "x" });
    expect(parseStoredProgress(raw, pairs, DATASET)).toMatchObject({
      kind: "ok",
      progress: { cursor: 0 },
    });
  });
});
