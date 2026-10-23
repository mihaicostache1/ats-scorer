"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function CandidatesToolbar({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
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
          placeholder="Search name or email…"
          aria-label="Search candidates by name or email"
          className="pl-9"
        />
      </div>
    </div>
  );
}
