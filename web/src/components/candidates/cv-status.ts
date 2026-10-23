import type { components } from "@/api/generated/schema";
import type { BadgeProps } from "@/components/ui/badge";

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
