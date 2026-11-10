import { Download, HelpCircle, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csvFileName } from "../_lib/csv";
import { counts, jobProgress, type Progress } from "../_lib/progress";
import type { Pair } from "../_lib/types";

/**
 * Title, rater name, how far along the rater is, and the actions that do not depend on the pair on
 * screen. The rater's name becomes the CSV's file name, which is how L-9 tells raters apart.
 */
export function ProgressHeader({
  pairs,
  progress,
  rater,
  slug,
  onRater,
  canUndo,
  onUndo,
  onExport,
  onHelp,
}: {
  pairs: Pair[];
  progress: Progress | null;
  rater: string;
  slug: string;
  onRater: (name: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onExport: () => void;
  onHelp: () => void;
}) {
  const summary = progress ? counts(progress, pairs) : null;
  const position = progress ? Math.min(progress.cursor + 1, pairs.length) : 0;

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-foreground text-large-title">Labeling tool</h1>
        <Badge variant="warning">Dev only</Badge>
        <p className="text-muted-foreground text-sm">
          Rate each CV against its job, 0 to 3. The CSV goes into{" "}
          <code className="font-mono text-xs">ml/evaluation/ratings/</code> for the L-9 evaluation.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-64 space-y-1">
          <label htmlFor="labeling-rater" className="text-sm font-medium">
            Your name
          </label>
          <Input
            id="labeling-rater"
            value={rater}
            onChange={(event) => onRater(event.target.value)}
            onKeyDown={(event) => {
              // Hands the keyboard back to the shortcuts, which are paused while a field has focus.
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="labeling-rater-file"
            placeholder="e.g. mihai"
          />
          <p id="labeling-rater-file" className="text-muted-foreground text-footnote">
            {slug ? (
              <>
                Saved as <code className="font-mono">{csvFileName(slug)}</code>. Press Enter to
                start rating.
              </>
            ) : (
              "Letters and digits. It names your file."
            )}
          </p>
        </div>

        {summary && (
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium" data-testid="labeling-progress">
              {progress && progress.cursor >= pairs.length
                ? "All pairs seen"
                : `Pair ${position} of ${summary.total}`}
              <span className="text-muted-foreground font-normal">
                {" · "}
                {summary.rated} rated · {summary.skipped} skipped
              </span>
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Progress per job">
              {progress &&
                jobProgress(progress, pairs).map((job) => (
                  <li key={job.jobId}>
                    <Badge variant={job.rated === job.total ? "success" : "outline"}>
                      {job.jobId} {job.rated}/{job.total}
                    </Badge>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!canUndo} onClick={onUndo}>
            <Undo2 aria-hidden="true" />
            Undo
            <kbd className="text-muted-foreground ml-1 font-mono text-xs">U</kbd>
          </Button>
          <Button type="button" variant="outline" disabled={!slug} onClick={onExport}>
            <Download aria-hidden="true" />
            Export CSV
            <kbd className="text-muted-foreground ml-1 font-mono text-xs">E</kbd>
          </Button>
          <Button type="button" variant="ghost" onClick={onHelp} aria-label="Keyboard shortcuts">
            <HelpCircle aria-hidden="true" />
            <kbd className="text-muted-foreground font-mono text-xs">?</kbd>
          </Button>
        </div>
      </div>
    </header>
  );
}
