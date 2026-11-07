"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "../_lib/shortcuts";

const kbd =
  "border-border bg-secondary text-secondary-foreground rounded border px-1.5 py-0.5 font-mono text-xs";

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Every shortcut also has a button on the page. Shortcuts are paused while you type in the
            name box, and while the CV viewer has the focus: click outside the PDF to use them
            again.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3">
          {SHORTCUTS.map(({ keys, does }) => (
            <div key={does} className="flex items-start gap-4">
              <dt className="flex w-44 shrink-0 flex-wrap gap-1">
                {keys.map((key) => (
                  <kbd key={key} className={kbd}>
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="text-foreground text-sm">{does}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground text-footnote">
          Rate on qualifications only: ignore the name, location, date of birth and how the layout
          looks, and rate before you look at any scores (docs/ml/evaluation.md).
        </p>
      </DialogContent>
    </Dialog>
  );
}
