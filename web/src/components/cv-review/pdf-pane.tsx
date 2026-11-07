"use client";

import * as React from "react";
import { ExternalLink, FileWarning, Loader2 } from "lucide-react";

import { downloadCandidateCV } from "@/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

type PdfState =
  { phase: "loading" } | { phase: "ready"; url: string } | { phase: "error"; message: string };

/**
 * The original CV in the browser's own PDF viewer, which brings zoom, search and keyboard paging
 * with it. The file only comes from the org-checked download endpoint, so it is fetched with the
 * session cookie and shown from a temporary object URL that is released when the pane goes away.
 */
export function PdfPane({
  candidateId,
  cvId,
  filename,
}: {
  candidateId: string;
  cvId: string;
  filename: string;
}) {
  const [state, setState] = React.useState<PdfState>({ phase: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      let next: PdfState;
      try {
        const { data, error, response } = await downloadCandidateCV(candidateId, cvId);
        if (data === undefined) {
          next = {
            phase: "error",
            message:
              response.status === 404
                ? "The original file could not be found."
                : parseApiFailure(error, response.status).message,
          };
        } else {
          // Re-wrapped so the viewer gets a PDF even if the server's content type were missing.
          objectUrl = URL.createObjectURL(
            new Blob([data as unknown as Blob], { type: "application/pdf" })
          );
          next = { phase: "ready", url: objectUrl };
        }
      } catch {
        next = { phase: "error", message: NETWORK_ERROR_MESSAGE };
      }
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      setState(next);
    };
    void run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidateId, cvId, attempt]);

  const retry = () => {
    setState({ phase: "loading" });
    setAttempt((n) => n + 1);
  };

  if (state.phase === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading the original CV"
        className="glass flex h-full min-h-80 flex-col gap-3 rounded-2xl p-4"
      >
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="w-full flex-1" />
        <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the original CV…
        </span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        className="border-destructive/20 bg-destructive/5 flex h-full min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center"
      >
        <FileWarning className="text-destructive size-8" aria-hidden="true" />
        <p className="text-foreground text-sm font-medium">Couldn&apos;t show the original CV</p>
        <p className="text-muted-foreground max-w-sm text-sm">{state.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-80 flex-col gap-2">
      <iframe
        src={state.url}
        title={`Original CV: ${filename}`}
        className="border-border bg-background min-h-0 w-full flex-1 rounded-2xl border"
      />
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "ghost", size: "xs", className: "self-start" })}
      >
        <ExternalLink aria-hidden="true" />
        Open the CV in a new tab
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
