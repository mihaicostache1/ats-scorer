"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function CandidatesToolbar({
  search,
  onSearchChange,
  total,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  /** Number of candidates matching the search, once known. */
  total?: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:w-80">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search candidates by name or email"
          className="pl-8"
        />
      </div>
      {total !== undefined && (
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {total} {total === 1 ? "candidate" : "candidates"}
        </p>
      )}
    </div>
  );
}
