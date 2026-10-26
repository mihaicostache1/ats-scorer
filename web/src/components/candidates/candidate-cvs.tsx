"use client";

import * as React from "react";

import { listCandidateCvDocuments } from "@/api";
import { Can } from "@/components/auth/can";
import { CvDropzone } from "./cv-dropzone";
import { CvRow } from "./cv-row";
import { CvUploadItem } from "./cv-upload-item";
import { describeCvStatus, type CvDocument } from "./cv-status";
import { ProfileSection, SectionBody, SectionEmpty } from "./profile-section";
import { unwrap, useResource } from "./use-resource";
import { useCvUploads } from "./use-cv-uploads";

/** Did anything a person would want to hear about change between two copies of a CV? */
function changedMeaningfully(previous: CvDocument, next: CvDocument): boolean {
  return (
    previous.status !== next.status ||
    previous.attempts !== next.attempts ||
    previous.error_code !== next.error_code
  );
}

/**
 * The candidate's CVs, the uploader, and live processing status.
 *
 * The fetched list is the starting point; CVs uploaded in this visit and fresher copies from
 * polling are layered on top by id, so the list never flashes back to a loading state.
 */
export function CandidateCvs({ candidateId }: { candidateId: string }) {
  const load = React.useCallback(
    async () => unwrap(await listCandidateCvDocuments(candidateId)),
    [candidateId]
  );
  const { state, refetch } = useResource(load);

  const [added, setAdded] = React.useState<CvDocument[]>([]);
  const [updates, setUpdates] = React.useState<Record<string, CvDocument>>({});
  const [announcement, setAnnouncement] = React.useState("");

  const handleUpdate = React.useCallback((next: CvDocument, previous: CvDocument) => {
    setUpdates((current) => ({ ...current, [next.id]: next }));
    if (changedMeaningfully(previous, next)) {
      setAnnouncement(`${next.original_filename}: ${describeCvStatus(next)}`);
    }
  }, []);

  const uploads = useCvUploads({
    candidateId,
    onUploaded: (cv) => setAdded((current) => [cv, ...current]),
    announce: setAnnouncement,
  });

  return (
    <ProfileSection
      id="cvs"
      title="CVs"
      description="Uploaded files and how far processing has got, newest first."
    >
      <Can action="candidate:write">
        <CvDropzone onFile={uploads.start} />
      </Can>

      <SectionBody state={state} label="CVs" onRetry={refetch}>
        {(fetched) => {
          const known = new Set(fetched.map((cv) => cv.id));
          const cvs = [...added.filter((cv) => !known.has(cv.id)), ...fetched].map(
            (cv) => updates[cv.id] ?? cv
          );

          if (cvs.length === 0 && uploads.pending.length === 0) {
            return <SectionEmpty>No CVs uploaded yet.</SectionEmpty>;
          }
          return (
            <ul className="divide-border divide-y">
              {uploads.pending.map((upload) => (
                <CvUploadItem
                  key={upload.key}
                  upload={upload}
                  onCancel={() => uploads.cancel(upload.key)}
                  onRetry={() => uploads.retry(upload.key)}
                  onDismiss={() => uploads.dismiss(upload.key)}
                />
              ))}
              {cvs.map((cv) => (
                <CvRow key={cv.id} candidateId={candidateId} cv={cv} onUpdate={handleUpdate} />
              ))}
            </ul>
          );
        }}
      </SectionBody>

      {/* Announces status changes (queued, extracting, parsed, failed…) to screen readers. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </ProfileSection>
  );
}
