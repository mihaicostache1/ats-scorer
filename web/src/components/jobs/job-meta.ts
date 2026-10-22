import type { BadgeProps } from "@/components/ui/badge";
import type { JobStatus } from "./use-jobs";

export const STATUS_BADGE: Record<JobStatus, { label: string; variant: BadgeProps["variant"] }> = {
  open: { label: "Open", variant: "success" },
  draft: { label: "Draft", variant: "warning" },
  paused: { label: "Paused", variant: "outline" },
  closed: { label: "Closed", variant: "secondary" },
  archived: { label: "Archived", variant: "secondary" },
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "full_time" → "Full-time" */
export function formatEmploymentType(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/^Full time$/, "Full-time");
}

/** The contract leaves `employment_type` a free string; these are the values the form offers. */
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
