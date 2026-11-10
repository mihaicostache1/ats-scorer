"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { formatConfidence, type ConfidenceMap } from "./confidence";

interface ReviewContextValue {
  confidence: ConfidenceMap | undefined;
  /** No edit rights: the controls are disabled and the add/remove buttons are not shown. */
  readOnly: boolean;
}

const ReviewContext = React.createContext<ReviewContextValue>({
  confidence: undefined,
  readOnly: false,
});

/** Gives the form fields the saved profile's confidence values and the viewer's access. */
export const ReviewProvider = ReviewContext.Provider;
export const useReviewContext = () => React.useContext(ReviewContext);

/** Added to a control whose value the parser was unsure about. The note below it carries the meaning. */
export const LOW_CONFIDENCE_CONTROL =
  "border-warning! ring-warning/25 ring-2 focus-visible:border-warning!";

/**
 * Says it in words as well as colour: "Low confidence (62%)". Place it inside the field's
 * `<FormDescription>`, so it is read out with the control.
 */
export function LowConfidenceNote({ value, scope = "value" }: { value: number; scope?: string }) {
  return (
    <span className="text-warning inline-flex items-start gap-1.5 font-medium">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Low confidence ({formatConfidence(value)}). Check this {scope} against the CV.
      </span>
    </span>
  );
}
