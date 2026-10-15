"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { JobStatus } from "./use-jobs";

/** Statuses offered in the filter (archived jobs are hidden from the list by default). */
export const STATUS_FILTERS = [
  "open",
  "draft",
  "paused",
  "closed",
] as const satisfies readonly JobStatus[];

const LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  open: "Open",
  draft: "Draft",
  paused: "Paused",
  closed: "Closed",
};

export function JobsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: (typeof STATUS_FILTERS)[number] | undefined;
  onStatusChange: (value: (typeof STATUS_FILTERS)[number] | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full min-w-56 flex-1 md:max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title or department…"
          aria-label="Search jobs by title or department"
          className="pl-9"
        />
      </div>
      <div className="w-full sm:w-44">
        <Select
          value={status ?? ""}
          onChange={(e) =>
            onStatusChange(STATUS_FILTERS.find((s) => s === e.target.value) ?? undefined)
          }
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
