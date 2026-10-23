"use client";

import * as React from "react";
import { getCandidateCvDocument } from "@/api";
import { isTerminalStatus, type CvDocument } from "./cv-status";

export const POLL_INITIAL_MS = 1000;
export const POLL_FACTOR = 1.5;
export const POLL_MAX_MS = 8000;
/** The worst case on the server is a few minutes; past this we stop asking and say so. */
export const POLL_BUDGET_MS = 10 * 60 * 1000;
export const POLL_MAX_FAILURES = 5;

/** Wait before poll number `pollIndex` (0 = first): 1 s, 1.5 s, 2.25 s … capped at 8 s. */
export function nextDelay(pollIndex: number): number {
  return Math.min(POLL_MAX_MS, Math.round(POLL_INITIAL_MS * POLL_FACTOR ** pollIndex));
}

/**
 * - `polling`: asking the server on a backoff schedule.
 * - `idle`: nothing to do (the CV is already in a final state).
 * - `lost`: several requests in a row failed.
 * - `timed-out`: still processing after the time budget.
 * - `gone`: the CV no longer exists (404).
 */
export type PollState = "idle" | "polling" | "lost" | "timed-out" | "gone";

/**
 * Follows one CV until it reaches a final state. Polling stops when the status is terminal, when
 * the component unmounts (leaving the page), after repeated failures, on a 404, or after the time
 * budget. `checkNow` starts again after any of the stops.
 */
export function useCvPolling({
  candidateId,
  cv,
  onUpdate,
}: {
  candidateId: string;
  cv: CvDocument;
  /** Called with each fresh copy and the one it replaces, so callers can tell what changed. */
  onUpdate: (next: CvDocument, previous: CvDocument) => void;
}) {
  const [stopped, setStopped] = React.useState<Exclude<PollState, "idle" | "polling"> | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  // Latest props, readable from the polling loop without restarting it.
  const latest = React.useRef({ onUpdate, cv });
  React.useEffect(() => {
    latest.current = { onUpdate, cv };
  });

  const cvId = cv.id;
  const active = !isTerminalStatus(cv.status) && stopped === null;

  React.useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let polls = 0;
    let failures = 0;

    const schedule = () => {
      timer = setTimeout(run, nextDelay(polls));
    };

    const run = async () => {
      if (Date.now() - startedAt >= POLL_BUDGET_MS) {
        setStopped("timed-out");
        return;
      }
      try {
        const { data, response } = await getCandidateCvDocument(candidateId, cvId);
        if (cancelled) return;
        if (data) {
          failures = 0;
          polls++;
          latest.current.onUpdate(data, latest.current.cv);
          if (!isTerminalStatus(data.status)) schedule();
          return;
        }
        if (response.status === 404) {
          setStopped("gone");
          return;
        }
        failures++;
      } catch {
        if (cancelled) return;
        failures++;
      }
      if (failures >= POLL_MAX_FAILURES) {
        setStopped("lost");
        return;
      }
      polls++;
      schedule();
    };

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, candidateId, cvId, attempt]);

  const checkNow = React.useCallback(() => {
    setStopped(null);
    setAttempt((n) => n + 1);
  }, []);

  const pollState: PollState = stopped ?? (isTerminalStatus(cv.status) ? "idle" : "polling");
  return { pollState, checkNow };
}
