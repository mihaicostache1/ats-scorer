import { isRating, pairKey, type Pair, type Rating } from "./types";

/**
 * A rater's progress through the pairs, as plain data with pure transitions, so rate, skip and undo
 * can be tested without a browser. The store (`store.ts`) saves it to localStorage.
 */

/** What a pair was before an action: not looked at, skipped, or rated. */
export type PairState = Rating | "skipped" | null;

export interface HistoryEntry {
  /** `C001|J01` */
  pair: string;
  /** The pair's state before the action, which is what undo puts back. */
  before: PairState;
  /** Where the cursor was before the action. */
  cursorBefore: number;
}

export interface Progress {
  version: 1;
  /** The evaluation-set version these ratings belong to. */
  datasetId: string;
  ratings: Record<string, Rating>;
  /** Pairs that were skipped and are still unrated. */
  skipped: string[];
  /** Every rate and skip, oldest first. Persisted, so undo still works after a reload. */
  history: HistoryEntry[];
  /** Index of the pair on screen. `pairs.length` means all pairs were visited: the summary. */
  cursor: number;
}

export const emptyProgress = (datasetId: string): Progress => ({
  version: 1,
  datasetId,
  ratings: {},
  skipped: [],
  history: [],
  cursor: 0,
});

export function stateOf(progress: Progress, key: string): PairState {
  const rating = progress.ratings[key];
  if (rating !== undefined) return rating;
  return progress.skipped.includes(key) ? "skipped" : null;
}

/** The progress with `key` put into `state`. */
function withState(progress: Progress, key: string, state: PairState): Progress {
  const ratings = { ...progress.ratings };
  const skipped = progress.skipped.filter((item) => item !== key);
  delete ratings[key];
  if (state === "skipped") skipped.push(key);
  else if (state !== null) ratings[key] = state;
  return { ...progress, ratings, skipped };
}

const clampCursor = (index: number, pairs: readonly Pair[]) =>
  Math.min(Math.max(0, Math.trunc(index)), pairs.length);

/** Rates the pair on screen and moves on. Does nothing on the summary screen. */
export function rate(progress: Progress, pairs: readonly Pair[], value: Rating): Progress {
  const pair = pairs[progress.cursor];
  if (!pair) return progress;
  const key = pairKey(pair);
  const next = withState(progress, key, value);
  return {
    ...next,
    cursor: clampCursor(progress.cursor + 1, pairs),
    history: [
      ...progress.history,
      { pair: key, before: stateOf(progress, key), cursorBefore: progress.cursor },
    ],
  };
}

/**
 * Leaves the pair on screen without a rating and moves on. A pair that already has a rating keeps
 * it: skipping is "not now", never "erase". Either way undo comes back to it.
 */
export function skip(progress: Progress, pairs: readonly Pair[]): Progress {
  const pair = pairs[progress.cursor];
  if (!pair) return progress;
  const key = pairKey(pair);
  const before = stateOf(progress, key);
  const next = typeof before === "number" ? progress : withState(progress, key, "skipped");
  return {
    ...next,
    cursor: clampCursor(progress.cursor + 1, pairs),
    history: [...progress.history, { pair: key, before, cursorBefore: progress.cursor }],
  };
}

/** Takes back the last rate or skip and returns to that pair. Does nothing with no history. */
export function undo(progress: Progress): Progress {
  const last = progress.history.at(-1);
  if (!last) return progress;
  return {
    ...withState(progress, last.pair, last.before),
    cursor: last.cursorBefore,
    history: progress.history.slice(0, -1),
  };
}

/** Moves to a pair (or to the summary) without changing any rating. */
export function goTo(progress: Progress, pairs: readonly Pair[], index: number): Progress {
  const cursor = clampCursor(index, pairs);
  return cursor === progress.cursor ? progress : { ...progress, cursor };
}

export interface Counts {
  total: number;
  rated: number;
  skipped: number;
  /** Not rated: skipped pairs and pairs not looked at yet. */
  unrated: number;
}

export function counts(progress: Progress, pairs: readonly Pair[]): Counts {
  let rated = 0;
  let skipped = 0;
  for (const pair of pairs) {
    const state = stateOf(progress, pairKey(pair));
    if (typeof state === "number") rated += 1;
    else if (state === "skipped") skipped += 1;
  }
  return { total: pairs.length, rated, skipped, unrated: pairs.length - rated };
}

/** Rated pairs per job, in the order the jobs first appear, since they are rated one job at a time. */
export function jobProgress(progress: Progress, pairs: readonly Pair[]) {
  const jobs = new Map<string, { jobId: string; rated: number; total: number }>();
  for (const pair of pairs) {
    const entry = jobs.get(pair.jobId) ?? { jobId: pair.jobId, rated: 0, total: 0 };
    entry.total += 1;
    if (typeof stateOf(progress, pairKey(pair)) === "number") entry.rated += 1;
    jobs.set(pair.jobId, entry);
  }
  return [...jobs.values()];
}

/** Index of the first pair without a rating (skipped, or not looked at), or -1 when all are rated. */
export function firstUnrated(progress: Progress, pairs: readonly Pair[]): number {
  return pairs.findIndex((pair) => typeof stateOf(progress, pairKey(pair)) !== "number");
}

// ─── Stored progress ──────────────────────────────────────────────────────────

export type StoredProgress =
  /** Nothing saved for this rater. */
  | { kind: "none" }
  /** Saved data that cannot be read: treated as nothing, and not applied. */
  | { kind: "corrupt" }
  /** Saved for another version of the evaluation set; not applied, the rater decides. */
  | { kind: "mismatch"; ratedCount: number; ratings: Record<string, unknown> }
  | { kind: "ok"; progress: Progress };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads saved progress for the current pairs. Anything that does not fit is dropped rather than
 * trusted: unknown pairs, ratings outside 0-3, history entries that point nowhere. The cursor is
 * brought back into range.
 */
export function parseStoredProgress(
  raw: string | null,
  pairs: readonly Pair[],
  datasetId: string
): StoredProgress {
  if (raw === null) return { kind: "none" };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "corrupt" };
  }
  if (!isRecord(data) || data.version !== 1 || typeof data.datasetId !== "string") {
    return { kind: "corrupt" };
  }
  if (!isRecord(data.ratings)) return { kind: "corrupt" };

  if (data.datasetId !== datasetId) {
    const ratedCount = Object.values(data.ratings).filter(isRating).length;
    return { kind: "mismatch", ratedCount, ratings: data.ratings };
  }

  const keys = new Set(pairs.map(pairKey));
  const ratings: Record<string, Rating> = {};
  for (const [key, value] of Object.entries(data.ratings)) {
    if (keys.has(key) && isRating(value)) ratings[key] = value;
  }
  const skipped = (Array.isArray(data.skipped) ? data.skipped : []).filter(
    (key): key is string => typeof key === "string" && keys.has(key) && !(key in ratings)
  );
  const history: HistoryEntry[] = [];
  for (const entry of Array.isArray(data.history) ? data.history : []) {
    if (!isRecord(entry) || typeof entry.pair !== "string" || !keys.has(entry.pair)) continue;
    const before = entry.before;
    if (!(before === null || before === "skipped" || isRating(before))) continue;
    const cursorBefore = entry.cursorBefore;
    if (
      typeof cursorBefore !== "number" ||
      !Number.isInteger(cursorBefore) ||
      cursorBefore < 0 ||
      cursorBefore > pairs.length
    ) {
      continue;
    }
    history.push({ pair: entry.pair, before, cursorBefore });
  }
  const cursor =
    typeof data.cursor === "number" && Number.isFinite(data.cursor)
      ? clampCursor(data.cursor, pairs)
      : 0;

  return { kind: "ok", progress: { version: 1, datasetId, ratings, skipped, history, cursor } };
}

export const serializeProgress = (progress: Progress): string => JSON.stringify(progress);
