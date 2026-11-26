"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { JobStatus } from "./use-jobs";

/** Statuses offered in the filter (archived jobs are hidden from the list by default). */
export const STATUS_FILTERS = [
  "open",
  "draft",
  "paused",
  "closed",
] as const satisfies readonly JobStatus[];

type StatusFilter = (typeof STATUS_FILTERS)[number];

const LABELS: Record<StatusFilter, string> = {
  open: "Open",
  draft: "Draft",
  paused: "Paused",
  closed: "Closed",
};

const OPTIONS: { value: StatusFilter | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  ...STATUS_FILTERS.map((value) => ({ value, label: LABELS[value] })),
];

/** One toolbar: search on the left, a segmented status filter, and the result count. */
export function JobsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  total,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: StatusFilter | undefined;
  onStatusChange: (value: StatusFilter | undefined) => void;
  /** Number of jobs matching the current filters, once known. */
  total?: number;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search title or department"
            aria-label="Search jobs by title or department"
            className="pl-8"
          />
        </div>
        <div
          role="group"
          aria-label="Filter by status"
          className="bg-secondary inline-flex h-9 w-full items-center gap-0.5 overflow-x-auto rounded-lg p-0.5 sm:w-auto"
        >
          {OPTIONS.map((option) => {
            const active = option.value === status;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  "focus-visible:ring-ring h-8 flex-1 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none sm:flex-none",
                  active
                    ? "bg-card text-foreground font-medium shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(10_16_34/0.06)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {total !== undefined && (
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {total} {total === 1 ? "job" : "jobs"}
        </p>
      )}
    </div>
  );
}
