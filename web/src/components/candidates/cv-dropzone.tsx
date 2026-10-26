"use client";

import * as React from "react";
import { FileUp } from "lucide-react";

import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CV_ACCEPT,
  CV_ONE_FILE_MESSAGE,
  MAX_CV_SIZE_BYTES,
  validateCvFile,
} from "./cv-upload-rules";

/**
 * Drop a PDF here or choose one. The file input is a real, focusable control inside a label, so
 * the keyboard and screen readers work without the drag-and-drop. A file that fails the checks is
 * explained in an alert and never sent.
 */
export function CvDropzone({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hintId = React.useId();

  const accept = async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length > 1) return setError(CV_ONE_FILE_MESSAGE);
    const problem = await validateCvFile(files[0]);
    setError(problem);
    if (!problem) onFile(files[0]);
  };

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Upload a CV"
        aria-describedby={hintId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) void accept(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "border-border flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
          disabled && "opacity-60"
        )}
      >
        <FileUp className="text-muted-foreground size-6" aria-hidden="true" />
        <p className="text-sm">
          Drag and drop a PDF here, or
          <label className="focus-within:ring-ring border-input bg-background hover:bg-muted ml-2 inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm font-medium shadow-xs focus-within:ring-2">
            Choose PDF
            <input
              type="file"
              accept={CV_ACCEPT}
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                // Clearing lets the same file be picked again after fixing it.
                event.target.value = "";
                void accept(files);
              }}
            />
          </label>
        </p>
        <p id={hintId} className="text-muted-foreground text-xs">
          PDF only, up to {formatBytes(MAX_CV_SIZE_BYTES).replace(".0", "")}. One file at a time.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
