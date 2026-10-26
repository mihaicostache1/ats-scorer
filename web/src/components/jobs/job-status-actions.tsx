"use client";

import * as React from "react";
import { Archive, Loader2, Lock } from "lucide-react";

import { archiveJob, updateJobStatus } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import type { JobResponse } from "./use-jobs";

type StatusAction = "close" | "archive";

const COPY: Record<
  StatusAction,
  { title: string; description: string; confirm: string; busy: string }
> = {
  close: {
    title: "Close this job?",
    description:
      "Existing applications stay visible, but the job stops accepting new ones. You can still edit it.",
    confirm: "Close job",
    busy: "Closing…",
  },
  archive: {
    title: "Archive this job?",
    description:
      "Archived jobs are hidden from the jobs list. Their applications are kept, but you can't reopen the job from here.",
    confirm: "Archive job",
    busy: "Archiving…",
  },
};

/**
 * "Close job" and "Archive" buttons, each behind a confirmation dialog. The dialog opens with focus
 * on Cancel, closes with Esc, and returns focus to the button that opened it.
 */
export function JobStatusActions({
  job,
  onChanged,
}: {
  job: JobResponse;
  /** Called with the updated job after a successful change. */
  onChanged: (job: JobResponse, action: StatusAction) => void;
}) {
  const [action, setAction] = React.useState<StatusAction | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  // Keep the copy while the dialog animates closed.
  const [shown, setShown] = React.useState<StatusAction>("close");

  const canClose = job.status !== "closed" && job.status !== "archived";
  const canArchive = job.status !== "archived";

  const open = (next: StatusAction) => {
    setShown(next);
    setAction(next);
  };

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const { data, error, response } =
        action === "close"
          ? await updateJobStatus(job.id, { status: "closed" })
          : await archiveJob(job.id);
      if (!data) {
        toast.error(
          parseApiFailure(error, response.status).message,
          action === "close" ? "Couldn't close job" : "Couldn't archive job"
        );
        return;
      }
      setAction(null);
      toast.success(
        action === "close" ? `“${data.title}” was closed.` : `“${data.title}” was archived.`,
        action === "close" ? "Job closed" : "Job archived"
      );
      onChanged(data, action);
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[shown];

  return (
    <>
      {canClose && (
        <Button type="button" variant="outline" onClick={() => open("close")} className="gap-2">
          <Lock className="size-4" aria-hidden="true" />
          Close job
        </Button>
      )}
      {canArchive && (
        <Button type="button" variant="outline" onClick={() => open("archive")} className="gap-2">
          <Archive className="size-4" aria-hidden="true" />
          Archive
        </Button>
      )}

      <Dialog
        open={action !== null}
        onOpenChange={(next) => {
          // Don't let Esc or a backdrop click interrupt a request in flight.
          if (!next && !busy) setAction(null);
        }}
      >
        <DialogContent initialFocus={cancelRef} hideClose>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              <span className="text-foreground font-medium">{job.title}</span>
              {" — "}
              {copy.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={shown === "archive" ? "destructive" : "default"}
              disabled={busy}
              onClick={confirm}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? copy.busy : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
