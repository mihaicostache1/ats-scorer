"use client";

import * as React from "react";
import Link from "next/link";
import { Download, FileText, Loader2, RotateCcw } from "lucide-react";

import { downloadCandidateCV, retryCandidateCvExtraction } from "@/api";
import { Can } from "@/components/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CV_STATUS_BADGE,
  cvReviewHref,
  describeCvStatus,
  errorHint,
  isReviewable,
  type CvDocument,
} from "./cv-status";
import { POLL_BUDGET_MS, useCvPolling, type PollState } from "./use-cv-polling";

/** CVs are private: they are fetched with the session cookie and saved from memory, never linked. */
function DownloadButton({ candidateId, cv }: { candidateId: string; cv: CvDocument }) {
  const [busy, setBusy] = React.useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { data, error, response } = await downloadCandidateCV(candidateId, cv.id);
      if (!data) {
        toast.error(parseApiFailure(error, response.status).message, "Couldn't download CV");
        return;
      }
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = cv.original_filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE, "Couldn't download CV");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={busy}
      onClick={download}
      aria-label={`Download ${cv.original_filename}`}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="size-3.5" aria-hidden="true" />
      )}
      Download
    </Button>
  );
}

const POLL_MESSAGES: Partial<Record<PollState, string>> = {
  lost: "We lost contact with the server while checking progress.",
  "timed-out": `Still processing after ${POLL_BUDGET_MS / 60000} minutes. Check again in a while.`,
  gone: "This CV no longer exists.",
};

/**
 * One CV: its file details, where processing is, and what can be done next (review, retry,
 * download). A CV that is still being processed polls itself until it reaches a final state.
 */
export function CvRow({
  candidateId,
  cv,
  onUpdate,
}: {
  candidateId: string;
  cv: CvDocument;
  /** A fresher copy of this CV, with the one it replaces. */
  onUpdate: (next: CvDocument, previous: CvDocument) => void;
}) {
  const { pollState, checkNow } = useCvPolling({ candidateId, cv, onUpdate });
  const [retrying, setRetrying] = React.useState(false);

  const status = CV_STATUS_BADGE[cv.status];
  const failed = cv.status === "failed";
  const hint = failed ? errorHint(cv.error_code) : null;
  const pollMessage = POLL_MESSAGES[pollState];

  const retry = async () => {
    setRetrying(true);
    try {
      const { data, error, response } = await retryCandidateCvExtraction(candidateId, cv.id);
      if (!data) {
        toast.error(parseApiFailure(error, response.status).message, "Couldn't retry");
        return;
      }
      onUpdate(data, cv);
      checkNow();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE, "Couldn't retry");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start gap-3">
        <FileText className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold break-all">{cv.original_filename}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {[
              formatBytes(cv.size_bytes),
              cv.page_count ? `${cv.page_count} ${cv.page_count === 1 ? "page" : "pages"}` : null,
              cv.ocr_used ? "OCR used" : null,
              `Uploaded ${formatDate(cv.created_at)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className={cn("mt-1 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
            {describeCvStatus(cv)}
          </p>
          {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
          {pollMessage && <p className="text-muted-foreground mt-0.5 text-xs">{pollMessage}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant}>
          <span className="sr-only">Parse status: </span>
          {status.label}
        </Badge>
        {isReviewable(cv.status) && (
          <Link
            href={cvReviewHref(candidateId, cv.id)}
            className={buttonVariants({ variant: "default", size: "sm" })}
            aria-label={`Review ${cv.original_filename}`}
          >
            Review
          </Link>
        )}
        {failed && (
          <Can action="candidate:write">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={retrying}
              onClick={retry}
              aria-label={`Retry ${cv.original_filename}`}
            >
              {retrying ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-3.5" aria-hidden="true" />
              )}
              Retry
            </Button>
          </Can>
        )}
        {(pollState === "lost" || pollState === "timed-out") && (
          <Button type="button" variant="outline" size="sm" onClick={checkNow}>
            Check again
          </Button>
        )}
        <DownloadButton candidateId={candidateId} cv={cv} />
      </div>
    </li>
  );
}
