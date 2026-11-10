"use client";

import * as React from "react";

import { raterSlug } from "./csv";
import {
  emptyProgress,
  parseStoredProgress,
  serializeProgress,
  type Progress,
  type StoredProgress,
} from "./progress";
import type { LabelingData } from "./types";

/**
 * Progress lives in `localStorage`, one entry per rater, so it survives a reload and a closed tab.
 * It is read through `useSyncExternalStore`: the server (and the first client render) see "not loaded
 * yet", so the page hydrates cleanly, and a second tab's changes arrive through the `storage` event.
 * When `localStorage` cannot be used (some private windows, blocked site data) it falls back to
 * memory, and `storageWarning` says that nothing will outlive the page.
 */

const RATER_KEY = "ats-scorer:labeling:rater";
export const progressKey = (slug: string) => `ats-scorer:labeling:v1:${slug}`;

const listeners = new Set<() => void>();
const memory = new Map<string, string>();
let storageWorks: boolean | null = null;

function canUseStorage(): boolean {
  if (storageWorks !== null) return storageWorks;
  try {
    const probe = "ats-scorer:labeling:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
  return storageWorks;
}

function read(key: string): string | null {
  if (!canUseStorage()) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  if (canUseStorage()) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Full or blocked: the in-memory copy above still keeps this page working.
      storageWorks = false;
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The stored string for a key; `undefined` until the browser has been asked (server and hydration). */
function useStored(key: string | null): string | null | undefined {
  return React.useSyncExternalStore(
    subscribe,
    () => (key === null ? null : read(key)),
    () => undefined
  );
}

export interface LabelingState {
  /** False until the browser's storage has been read. */
  ready: boolean;
  /** The name as typed. */
  rater: string;
  /** The name as it will be used for the file: `ratings/<slug>.csv`. Empty until usable. */
  slug: string;
  setRater: (name: string) => void;
  /** The rater's progress. `null` without a usable rater name, or while saved data needs a decision. */
  progress: Progress | null;
  /** Saved ratings that belong to another version of the evaluation set, waiting for a decision. */
  mismatch: { ratedCount: number; ratings: Record<string, unknown> } | null;
  /** Applies a change to the progress and saves it. */
  update: (change: (progress: Progress) => Progress) => void;
  /** Throws away saved ratings that do not belong to this evaluation set. */
  discardSaved: () => void;
  storageWarning: boolean;
}

export function useLabelingState(data: LabelingData): LabelingState {
  const storedRater = useStored(RATER_KEY);
  const rater = storedRater ?? "";
  const slug = raterSlug(rater);
  const key = slug ? progressKey(slug) : null;
  const raw = useStored(key);
  const ready = storedRater !== undefined && raw !== undefined;

  const { pairs, datasetId } = data;
  const stored: StoredProgress = React.useMemo(
    () => (raw === undefined ? { kind: "none" } : parseStoredProgress(raw, pairs, datasetId)),
    [raw, pairs, datasetId]
  );

  const progress = React.useMemo<Progress | null>(() => {
    if (!ready || !slug || stored.kind === "mismatch") return null;
    return stored.kind === "ok" ? stored.progress : emptyProgress(datasetId);
  }, [ready, slug, stored, datasetId]);

  const setRater = React.useCallback((name: string) => write(RATER_KEY, name), []);

  const update = React.useCallback(
    (change: (progress: Progress) => Progress) => {
      if (!key) return;
      // Read again instead of trusting what was rendered, so two quick key presses both count.
      const latest = parseStoredProgress(read(key), pairs, datasetId);
      if (latest.kind === "mismatch") return;
      const current = latest.kind === "ok" ? latest.progress : emptyProgress(datasetId);
      write(key, serializeProgress(change(current)));
    },
    [key, pairs, datasetId]
  );

  const discardSaved = React.useCallback(() => {
    if (key) write(key, null);
  }, [key]);

  return {
    ready,
    rater,
    slug,
    setRater,
    progress,
    mismatch:
      stored.kind === "mismatch"
        ? { ratedCount: stored.ratedCount, ratings: stored.ratings }
        : null,
    update,
    discardSaved,
    storageWarning: ready && !canUseStorage(),
  };
}
