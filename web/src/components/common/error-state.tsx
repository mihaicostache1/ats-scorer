"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  error?: Error | string;
  onRetry?: () => void;
  action?: React.ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  description = "An error occurred while processing your request. Please try again.",
  error,
  onRetry,
  action,
  className,
  ...props
}: ErrorStateProps) {
  const [showDetails, setShowDetails] = React.useState(false);
  const errorMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : null;

  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/20 bg-destructive/5 animate-in fade-in-50 flex min-h-[280px] flex-col items-center justify-center rounded-xl border p-8 text-center",
        className
      )}
      {...props}
    >
      <div className="bg-destructive/15 text-destructive mb-4 flex size-14 items-center justify-center rounded-full">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <h3 className="text-foreground text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>

      {errorMessage && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-xs underline underline-offset-4 focus-visible:ring-1 focus-visible:outline-none"
          >
            {showDetails ? "Hide technical details" : "Show technical details"}
          </button>
          {showDetails && (
            <pre className="bg-muted/70 text-destructive mt-2 max-w-lg overflow-x-auto rounded-md p-3 text-left font-mono text-xs">
              {errorMessage}
            </pre>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="gap-2">
            <RotateCcw className="size-4" />
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
