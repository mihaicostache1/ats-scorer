"use client";

import * as React from "react";
import { Download, FileText, Loader2 } from "lucide-react";

import { downloadCandidateCV, listCandidateCvDocuments } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import { formatBytes, formatDate } from "@/lib/format";
import { CV_STATUS_BADGE, type CvDocument } from "./cv-status";
import { ProfileSection, SectionBody, SectionEmpty } from "./profile-section";
import { unwrap, useResource } from "./use-resource";

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

export function CandidateCvs({ candidateId }: { candidateId: string }) {
  const load = React.useCallback(
    async () => unwrap(await listCandidateCvDocuments(candidateId)),
    [candidateId]
  );
  const { state, refetch } = useResource(load);

  return (
    <ProfileSection
      id="cvs"
      title="CVs"
      description="Uploaded files and how far processing has got, newest first."
    >
      <SectionBody state={state} label="CVs" onRetry={refetch}>
        {(cvs) =>
          cvs.length === 0 ? (
            <SectionEmpty>No CVs uploaded yet.</SectionEmpty>
          ) : (
            <ul className="divide-border divide-y">
              {cvs.map((cv) => {
                const status = CV_STATUS_BADGE[cv.status];
                return (
                  <li
                    key={cv.id}
                    className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText
                        className="text-muted-foreground mt-0.5 size-5 shrink-0"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-foreground text-sm font-semibold break-all">
                          {cv.original_filename}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {[
                            formatBytes(cv.size_bytes),
                            cv.page_count
                              ? `${cv.page_count} ${cv.page_count === 1 ? "page" : "pages"}`
                              : null,
                            cv.ocr_used ? "OCR used" : null,
                            `Uploaded ${formatDate(cv.created_at)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {cv.status === "failed" && (
                          <p className="text-destructive mt-1 text-xs">
                            {cv.error_message ?? "Processing failed."}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status.variant}>
                        <span className="sr-only">Parse status: </span>
                        {status.label}
                      </Badge>
                      <DownloadButton candidateId={candidateId} cv={cv} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </SectionBody>
    </ProfileSection>
  );
}
