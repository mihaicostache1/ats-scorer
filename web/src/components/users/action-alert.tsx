"use client";

import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserActionError } from "./user-errors";

/**
 * A failed user action, shown where it can be read in full and stays until dismissed (a toast
 * would vanish before the "what now" sentence is read). `role="alert"` announces it to screen
 * readers.
 */
export function ActionAlert({
  error,
  onDismiss,
  className,
}: {
  error: UserActionError;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-sm",
        className
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{error.title}</p>
        {error.description && <p className="mt-0.5">{error.description}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="focus-visible:ring-destructive/25 -m-1 rounded-md p-1 hover:bg-current/10 focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
