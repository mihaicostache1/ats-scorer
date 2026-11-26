"use client";

import * as React from "react";
import { ExternalLink, FileText, FileWarning, Loader2 } from "lucide-react";

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

  const toolbar = (
    <div className="border-border bg-background/70 flex h-10 shrink-0 items-center justify-between gap-3 border-b px-4">
      <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-mono text-[11.5px]">{filename}</span>
      </p>
      {state.phase === "ready" && (
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "ghost", size: "xs" })}
        >
          <ExternalLink aria-hidden="true" />
          Open the CV in a new tab
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );

  if (state.phase === "loading") {
    return (
      <div className="flex h-full min-h-80 flex-col">
        {toolbar}
        <div
          role="status"
          aria-label="Loading the original CV"
          className="flex flex-1 flex-col items-center justify-center gap-4 p-8"
        >
          <Skeleton className="aspect-[1/1.32] w-full max-w-[420px] rounded-[3px] bg-white/70 dark:bg-white/5" />
          <span className="text-muted-foreground inline-flex items-center gap-2 text-[13px]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading the original CV…
          </span>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex h-full min-h-80 flex-col">
        {toolbar}
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <FileWarning className="text-destructive size-7" aria-hidden="true" />
          <p className="text-foreground text-sm font-medium">Couldn&apos;t show the original CV</p>
          <p className="text-muted-foreground max-w-sm text-[13px]">{state.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-80 flex-col">
      {toolbar}
      <div className="min-h-0 flex-1 p-3 sm:p-4">
        <iframe
          src={state.url}
          title={`Original CV: ${filename}`}
          className="h-full w-full rounded-md bg-white shadow-[0_1px_2px_rgb(10_16_34/0.08),0_12px_32px_-12px_rgb(10_16_34/0.3)]"
        />
      </div>
    </div>
  );
}
