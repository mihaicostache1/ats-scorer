import type { components } from "@/api/generated/schema";
import type { BadgeProps } from "@/components/ui/badge";
import { formatBytes } from "@/lib/format";

export type CvDocument = components["schemas"]["CvDocumentResponse"];
export type CvStatus = CvDocument["status"];

/** How far a CV has got. The extraction worker reaches `extracted` or `failed`; the parser follows. */
export const CV_STATUS_BADGE: Record<CvStatus, { label: string; variant: BadgeProps["variant"] }> =
  {
    queued: { label: "Queued", variant: "secondary" },
    extracting: { label: "Extracting text", variant: "secondary" },
    extracted: { label: "Text extracted", variant: "outline" },
    parsed: { label: "Parsed", variant: "success" },
    needs_review: { label: "Needs review", variant: "warning" },
    failed: { label: "Failed", variant: "destructive" },
  };

/**
 * Statuses that end polling. `extracted` is included because nothing moves a CV past it until the
 * parser (B-13) exists; once it does, remove `extracted` from this list.
 */
export const TERMINAL_STATUSES = [
  "extracted",
  "parsed",
  "needs_review",
  "failed",
] as const satisfies readonly CvStatus[];

export const isTerminalStatus = (status: CvStatus): boolean =>
  (TERMINAL_STATUSES as readonly CvStatus[]).includes(status);

/** The worker tries a transient failure this many times before giving up. */
export const MAX_EXTRACTION_ATTEMPTS = 3;

/** CVs that have a review screen. */
export const isReviewable = (status: CvStatus): boolean =>
  status === "parsed" || status === "needs_review";

/** The CV review screen (F-11). One place to change if that route moves. */
export const cvReviewHref = (candidateId: string, cvId: string): string =>
  `/candidates/${candidateId}/cvs/${cvId}/review`;

/** One sentence on where a CV is, shown on its row and read out when it changes. */
export function describeCvStatus(cv: CvDocument): string {
  switch (cv.status) {
    case "queued":
      // A transient failure puts the CV back in the queue with its error still attached.
      return cv.error_code && cv.attempts > 0
        ? `Retrying automatically (attempt ${cv.attempts + 1} of ${MAX_EXTRACTION_ATTEMPTS})…`
        : "Waiting to be processed…";
    case "extracting":
      return cv.attempts > 1
        ? `Extracting text (attempt ${cv.attempts} of ${MAX_EXTRACTION_ATTEMPTS})…`
        : "Extracting text…";
    case "extracted": {
      const details = [
        cv.page_count ? `${cv.page_count} ${cv.page_count === 1 ? "page" : "pages"}` : null,
        cv.ocr_used ? "OCR used" : null,
      ].filter(Boolean);
      return details.length ? `Text extracted (${details.join(", ")}).` : "Text extracted.";
    }
    case "parsed":
      return "Parsed and ready to review.";
    case "needs_review":
      return "Parsed, but some fields need a human check.";
    case "failed":
      return cv.error_message ?? "Processing failed.";
  }
}

/** Errors that come from the file itself: trying the same file again gives the same result. */
const FILE_ERROR_HINTS: Record<string, string> = {
  invalid_pdf: "The file looks damaged. Upload a new copy.",
  encrypted_pdf: "Remove the password protection and upload the file again.",
  too_many_pages: "Upload a shorter version of the CV (up to 50 pages).",
  ocr_unavailable: "This looks like a scanned PDF. Upload a text-based version instead.",
  no_text_found: "Upload a clearer copy or a text-based PDF.",
  file_missing: "Upload the file again.",
};

/** Errors that are usually temporary, so retrying the same file is worth it. */
const TEMPORARY_ERROR_CODES = ["timeout", "internal_error", "queue_unavailable"];

/** What to do next after a failure, or `null` for a code we don't know. */
export function errorHint(code: string | null): string | null {
  if (!code) return null;
  if (TEMPORARY_ERROR_CODES.includes(code)) return "This is usually temporary. Try again.";
  return FILE_ERROR_HINTS[code] ?? null;
}

/** "alex.pdf, 47.1 KB, 2 pages". */
export function describeCvFile(cv: CvDocument): string {
  return [cv.original_filename, formatBytes(cv.size_bytes)].join(", ");
}
