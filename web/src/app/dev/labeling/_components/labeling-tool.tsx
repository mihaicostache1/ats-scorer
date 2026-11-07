"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, CircleCheck, Download, SkipForward, UserRound } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { csvFileName, exportLooseRatingsCsv, exportRatingsCsv } from "../_lib/csv";
import { downloadTextFile } from "../_lib/download";
import {
  counts,
  firstUnrated,
  goTo,
  rate,
  skip,
  stateOf,
  undo,
  type Progress,
} from "../_lib/progress";
import { actionForKey, type ShortcutAction } from "../_lib/shortcuts";
import { useLabelingState } from "../_lib/store";
import { pairKey, RATING_LABELS, type LabelingData, type Pair } from "../_lib/types";
import { HelpDialog } from "./help-dialog";
import { JobCard } from "./job-card";
import { ProgressHeader } from "./progress-header";
import { RatingBar } from "./rating-bar";

const describe = (pair: Pair) => `candidate ${pair.candidateId} for job ${pair.jobId}`;

/** What is on screen after a change, for the screen-reader announcement. */
function showing(pairs: readonly Pair[], next: Progress): string {
  const pair = pairs[next.cursor];
  return pair ? `Now showing ${describe(pair)}.` : "All pairs have been seen.";
}

function StatusChip({ state }: { state: ReturnType<typeof stateOf> }) {
  if (typeof state === "number") {
    return (
      <Badge variant="success">
        Rated {state} · {RATING_LABELS[state].name}
      </Badge>
    );
  }
  return state === "skipped" ? (
    <Badge variant="warning">Skipped</Badge>
  ) : (
    <Badge variant="outline">Not rated yet</Badge>
  );
}

/**
 * The labeling tool: a CV next to its job, rated 0-3 from the keyboard, with progress kept in the
 * browser and an export in the format L-9 reads. Dev only; see `src/lib/dev-routes.ts`.
 */
export function LabelingTool({ data }: { data: LabelingData }) {
  const { pairs, jobs } = data;
  const state = useLabelingState(data);
  const { progress, slug, update } = state;
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const current = progress && progress.cursor < pairs.length ? pairs[progress.cursor] : null;
  const currentState = progress && current ? stateOf(progress, pairKey(current)) : null;
  const atSummary = progress !== null && progress.cursor >= pairs.length;

  const exportCsv = React.useCallback(() => {
    if (!progress || !slug) {
      toast.info("Enter your name first. It names the file.", "Can't export yet");
      return;
    }
    downloadTextFile(csvFileName(slug), exportRatingsCsv(pairs, progress.ratings));
    const { rated, total, unrated } = counts(progress, pairs);
    const where = `Put ${csvFileName(slug)} in ml/evaluation/ratings/.`;
    if (rated === 0) {
      toast.warning(
        `No pair is rated yet, so the file is only the empty template. ${where}`,
        "Exported"
      );
    } else if (unrated > 0) {
      toast.warning(
        `${rated} of ${total} pairs are rated. The other ${unrated} stay empty, which L-9 ignores. ${where}`,
        "Exported"
      );
    } else {
      toast.success(`All ${total} pairs are rated. ${where}`, "Exported");
    }
  }, [progress, slug, pairs]);

  const act = React.useCallback(
    (action: ShortcutAction) => {
      switch (action.type) {
        case "help":
          setHelpOpen(true);
          return;
        case "export":
          exportCsv();
          return;
      }
      if (!progress || !slug) return;

      if (action.type === "rate" && current) {
        const next = rate(progress, pairs, action.value);
        update((latest) => rate(latest, pairs, action.value));
        setAnnouncement(`Rated ${describe(current)}: ${action.value}. ${showing(pairs, next)}`);
      } else if (action.type === "skip" && current) {
        const next = skip(progress, pairs);
        update((latest) => skip(latest, pairs));
        setAnnouncement(`Skipped ${describe(current)}. ${showing(pairs, next)}`);
      } else if (action.type === "undo") {
        if (progress.history.length === 0) return;
        const next = undo(progress);
        update(undo);
        setAnnouncement(`Undid the last action. ${showing(pairs, next)}`);
      } else if (action.type === "prev" || action.type === "next") {
        const next = goTo(progress, pairs, progress.cursor + (action.type === "next" ? 1 : -1));
        update((latest) => goTo(latest, pairs, latest.cursor + (action.type === "next" ? 1 : -1)));
        setAnnouncement(showing(pairs, next));
      }
    },
    [progress, slug, current, pairs, update, exportCsv]
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (helpOpen) return;
      const action = actionForKey(event);
      if (!action) return;
      event.preventDefault();
      act(action);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [act, helpOpen]);

  const header = (
    <ProgressHeader
      pairs={pairs}
      progress={progress}
      rater={state.rater}
      slug={slug}
      onRater={state.setRater}
      canUndo={(progress?.history.length ?? 0) > 0}
      onUndo={() => act({ type: "undo" })}
      onExport={() => act({ type: "export" })}
      onHelp={() => act({ type: "help" })}
    />
  );

  let body: React.ReactNode;
  if (!state.ready) {
    body = (
      <div role="status" aria-label="Loading" className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[60dvh] w-full" />
        <Skeleton className="h-[60dvh] w-full" />
      </div>
    );
  } else if (state.mismatch) {
    const { ratedCount, ratings } = state.mismatch;
    body = (
      <section
        role="alert"
        className="border-warning/40 bg-warning/10 space-y-3 rounded-2xl border p-5"
      >
        <h2 className="text-foreground text-headline">
          Your saved ratings are from another version of the evaluation set
        </h2>
        <p className="text-sm">
          {ratedCount} {ratedCount === 1 ? "rating was" : "ratings were"} saved for{" "}
          <code className="font-mono">{slug}</code>, but the CVs or jobs have changed since (the set
          was rebuilt). Ratings belong to one version, so they are not applied. Keep a copy if you
          need them, then start over.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadTextFile(`${slug}-previous-version.csv`, exportLooseRatingsCsv(ratings))
            }
          >
            <Download aria-hidden="true" />
            Download the old ratings
          </Button>
          <Button type="button" variant="destructive" onClick={state.discardSaved}>
            Start over
          </Button>
        </div>
      </section>
    );
  } else if (!slug || !progress) {
    body = (
      <EmptyState
        icon={UserRound}
        title="Enter your name to start"
        description="Your ratings are saved in this browser under your name, and the exported file is named after you, which is how L-9 tells raters apart."
      />
    );
  } else if (atSummary) {
    const summary = counts(progress, pairs);
    const unrated = firstUnrated(progress, pairs);
    body = (
      <section className="glass space-y-4 rounded-2xl p-6">
        <h2 className="text-foreground text-title-3 flex items-center gap-2">
          <CircleCheck className="text-success size-5" aria-hidden="true" />
          All pairs seen
        </h2>
        <p className="text-sm">
          {summary.rated} of {summary.total} rated
          {summary.unrated > 0 ? `, ${summary.unrated} still without a rating` : ""}.
          {summary.unrated > 0
            ? " Empty rows are fine: L-9 ignores them."
            : " Export the CSV and put it in ml/evaluation/ratings/."}
        </p>
        <div className="flex flex-wrap gap-2">
          {unrated >= 0 && (
            <Button type="button" onClick={() => update((p) => goTo(p, pairs, unrated))}>
              Review the {summary.unrated} unrated
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => update((p) => goTo(p, pairs, pairs.length - 1))}
          >
            <ArrowLeft aria-hidden="true" />
            Back to the last pair
          </Button>
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download aria-hidden="true" />
            Export {csvFileName(slug)}
          </Button>
        </div>
        <p className="text-muted-foreground text-footnote">
          Then, from <code className="font-mono">ml/</code>:{" "}
          <code className="font-mono">python -m ats_scoring.evaluate</code>
        </p>
      </section>
    );
  } else if (current) {
    body = (
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section
          aria-label={`CV of candidate ${current.candidateId}`}
          className="h-[65dvh] lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]"
        >
          <iframe
            key={pairKey(current)}
            src={`/dev/labeling/pdf/${current.candidateId}#view=FitH`}
            title={`CV of candidate ${current.candidateId}`}
            className="border-border bg-background h-full w-full rounded-2xl border"
          />
        </section>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Candidate {current.candidateId}</Badge>
            <StatusChip state={currentState} />
          </div>
          <JobCard job={jobs[current.jobId]} />
          <RatingBar
            current={typeof currentState === "number" ? currentState : null}
            disabled={false}
            onRate={(value) => act({ type: "rate", value })}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={progress.cursor === 0}
              onClick={() => act({ type: "prev" })}
            >
              <ArrowLeft aria-hidden="true" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-keyshortcuts="s"
              onClick={() => act({ type: "skip" })}
            >
              <SkipForward aria-hidden="true" />
              Skip
              <kbd className="text-muted-foreground ml-1 font-mono text-xs">S</kbd>
            </Button>
            <Button type="button" variant="outline" onClick={() => act({ type: "next" })}>
              Next
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          <p className="text-muted-foreground text-footnote">
            Keys 0-3, S, U and the arrows work while the page has the focus. After clicking inside
            the PDF, click outside it first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 p-4">
      {/* Here and not in a `metadata` export, which would be sent even if the page were blocked. */}
      <title>Labeling tool (dev)</title>
      {header}
      {state.storageWarning && (
        <p role="alert" className="border-warning/40 bg-warning/10 rounded-xl border p-3 text-sm">
          This browser is not letting the page save anything, so progress is lost when the tab
          closes. Export the CSV before you leave.
        </p>
      )}
      {body}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}
