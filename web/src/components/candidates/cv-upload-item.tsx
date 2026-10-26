"use client";

import * as React from "react";
import { FileText, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import type { PendingUpload } from "./use-cv-uploads";

/** A file on its way to the server: a progress bar with Cancel, or why it failed with Try again. */
export function CvUploadItem({
  upload,
  onCancel,
  onRetry,
  onDismiss,
}: {
  upload: PendingUpload;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { file, phase, progress, message } = upload;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <FileText className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-foreground text-sm font-semibold break-all">{file.name}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {formatBytes(file.size)} ·{" "}
              {phase === "uploading" ? `Uploading… ${progress}%` : "Upload failed"}
            </p>
          </div>
        </div>
        {phase === "uploading" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            aria-label={`Cancel upload of ${file.name}`}
          >
            Cancel
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="gap-1.5" onClick={onRetry}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Try again
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onDismiss}
              aria-label={`Dismiss ${file.name}`}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      {phase === "uploading" ? (
        <Progress value={progress} label={`Uploading ${file.name}`} className="mt-3" />
      ) : (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {message}
        </p>
      )}
    </li>
  );
}
