import type { components } from "@/api/generated/schema";

type CvDocumentResponse = components["schemas"]["CvDocumentResponse"];

/** The parts of a CV document a scenario can change as processing moves along. */
export type CvPatch = Partial<
  Pick<
    CvDocumentResponse,
    "status" | "page_count" | "ocr_used" | "error_code" | "error_message" | "attempts"
  >
>;

export interface CvScenario {
  /** Put this (lowercase, hyphens) anywhere in the file name to pick the scenario. */
  marker: string;
  description: string;
  /** The upload itself is refused: an HTTP error, or "network" for a request that never arrives. */
  uploadError?: { status: number; detail: string } | "network";
  /** The document as the upload returns it (default: queued). */
  initial?: CvPatch;
  /** What each successive status poll sees. The last entry repeats. */
  steps: CvPatch[];
  /** What each successive Retry does: the immediate answer, then what polls see. Last repeats. */
  retries?: { response: CvPatch; steps: CvPatch[] }[];
  /** Status polls that fail: the first `count` of them, or all of them. */
  pollFailure?: { kind: "server" | "network"; count?: number };
}

// Exact texts from the backend (api/app/services/cv_extraction.py and pdf_text.py).
const TIMEOUT_MESSAGE = "Text extraction took longer than 120 seconds.";
const GAVE_UP = " Gave up after 3 attempts.";
const INTERNAL_MESSAGE = "An unexpected error occurred during extraction.";

const failed = (error_code: string, error_message: string, attempts = 1): CvPatch => ({
  status: "failed",
  error_code,
  error_message,
  attempts,
});
const extracting: CvPatch = { status: "extracting", attempts: 1 };
const parsed: CvPatch = { status: "parsed", page_count: 2, ocr_used: false };

/**
 * Every state the CV upload UI can show, one scenario each. Status moves one step per poll (not
 * with the clock), so a test can count on exactly what it will see. Documented in web/README.md.
 */
export const CV_SCENARIOS: CvScenario[] = [
  {
    marker: "parsed",
    description: "Queued, extracting, then parsed (the default).",
    steps: [extracting, parsed],
  },
  {
    marker: "needs-review",
    description: "Parsed, but some fields need a human check.",
    steps: [extracting, { status: "needs_review", page_count: 3, ocr_used: false }],
  },
  {
    marker: "extracted",
    description: "Text extracted, nothing further (what the real backend does today).",
    steps: [extracting, { status: "extracted", page_count: 2, ocr_used: false }],
  },
  {
    marker: "ocr",
    description: "A scanned PDF that needed OCR.",
    steps: [extracting, { status: "parsed", page_count: 4, ocr_used: true }],
  },
  {
    marker: "slow",
    description: "Stays in extracting for several polls (shows the backoff).",
    steps: [
      { status: "queued" },
      ...Array.from({ length: 6 }, () => extracting),
      { status: "parsed", page_count: 12, ocr_used: false },
    ],
  },
  {
    marker: "stuck",
    description: "Never leaves the queue (no worker running).",
    steps: [{ status: "queued" }],
  },
  {
    marker: "timeout",
    description: "Times out twice and retries by itself, then gives up.",
    steps: [
      extracting,
      { status: "queued", attempts: 1, error_code: "timeout", error_message: TIMEOUT_MESSAGE },
      { status: "extracting", attempts: 2, error_code: "timeout", error_message: TIMEOUT_MESSAGE },
      { status: "queued", attempts: 2, error_code: "timeout", error_message: TIMEOUT_MESSAGE },
      { status: "extracting", attempts: 3, error_code: "timeout", error_message: TIMEOUT_MESSAGE },
      failed("timeout", TIMEOUT_MESSAGE + GAVE_UP, 3),
    ],
    retries: [
      {
        response: { status: "queued", attempts: 0, error_code: null, error_message: null },
        steps: [extracting, parsed],
      },
    ],
  },
  {
    marker: "encrypted",
    description: "A password-protected PDF.",
    steps: [
      extracting,
      failed("encrypted_pdf", "The PDF is password-protected and cannot be read."),
    ],
  },
  {
    marker: "corrupt",
    description: "A damaged PDF.",
    steps: [
      extracting,
      failed("invalid_pdf", "The file is damaged and could not be opened as a PDF."),
    ],
  },
  {
    marker: "no-text",
    description: "A PDF with no readable text.",
    steps: [extracting, failed("no_text_found", "No text was found in the PDF.")],
  },
  {
    marker: "too-many-pages",
    description: "More than 50 pages.",
    steps: [extracting, failed("too_many_pages", "The PDF has 80 pages; the limit is 50.")],
  },
  {
    marker: "fail-then-ok",
    description: "Fails once for a temporary reason; Retry works.",
    steps: [extracting, failed("internal_error", INTERNAL_MESSAGE + GAVE_UP, 3)],
    retries: [
      {
        response: { status: "queued", attempts: 0, error_code: null, error_message: null },
        steps: [extracting, parsed],
      },
    ],
  },
  {
    marker: "queue-down",
    description:
      "The file is saved but can't be queued; the first Retry fails too, the second works.",
    initial: failed(
      "queue_unavailable",
      "The file was saved but could not be queued for processing. Retry it later.",
      0
    ),
    steps: [],
    retries: [
      {
        response: failed(
          "queue_unavailable",
          "The file was saved but could not be queued for processing. Retry it later.",
          0
        ),
        steps: [],
      },
      {
        response: { status: "queued", attempts: 0, error_code: null, error_message: null },
        steps: [extracting, parsed],
      },
    ],
  },
  {
    marker: "poll-error",
    description: "The first two status checks fail with a server error, then it recovers.",
    steps: [extracting, parsed],
    pollFailure: { kind: "server", count: 2 },
  },
  {
    marker: "poll-lost",
    description: "Every status check fails (connection lost).",
    steps: [extracting, parsed],
    pollFailure: { kind: "network" },
  },
  {
    marker: "upload-413",
    description: "The server says the file is too large.",
    steps: [],
    uploadError: { status: 413, detail: "The file is larger than the 10 MB limit." },
  },
  {
    marker: "upload-415",
    description: "The server says it isn't a PDF.",
    steps: [],
    uploadError: { status: 415, detail: "Only PDF files are accepted." },
  },
  {
    marker: "upload-403",
    description: "The server refuses the upload for this role.",
    steps: [],
    uploadError: { status: 403, detail: "Not enough privileges" },
  },
  {
    marker: "upload-404",
    description: "The candidate no longer exists.",
    steps: [],
    uploadError: { status: 404, detail: "Candidate with ID 'x' was not found." },
  },
  {
    marker: "upload-500",
    description: "The server fails.",
    steps: [],
    uploadError: { status: 500, detail: "Internal Server Error" },
  },
  {
    marker: "upload-offline",
    description: "The request never reaches the server.",
    steps: [],
    uploadError: "network",
  },
];

/**
 * The scenario named in a file name; the default when no marker is present. A marker must stand
 * alone between separators ("alex-needs-review.pdf"), so an ordinary name like "Procrustes.pdf"
 * never matches by accident.
 */
export function scenarioForFile(fileName: string): CvScenario {
  const name = fileName.toLowerCase().replace(/[_\s]+/g, "-");
  const byLength = [...CV_SCENARIOS].sort((a, b) => b.marker.length - a.marker.length);
  return (
    byLength.find((s) => new RegExp(`(?:^|[^a-z0-9])${s.marker}(?:[^a-z0-9]|$)`).test(name)) ??
    CV_SCENARIOS[0]
  );
}
