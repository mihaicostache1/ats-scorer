"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ROLE_FILTERS,
  ROLE_LABELS,
  STATUS_FILTERS,
  type StatusFilter,
  type UserRole,
} from "./use-users";

const STATUS_LABELS: Record<StatusFilter, string> = { active: "Active", inactive: "Inactive" };

export function UsersToolbar({
  search,
  onSearchChange,
  role,
  onRoleChange,
  status,
  onStatusChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  role: UserRole | undefined;
  onRoleChange: (value: UserRole | undefined) => void;
  status: StatusFilter | undefined;
  onStatusChange: (value: StatusFilter | undefined) => void;
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
          aria-label="Search users by name or email"
          className="pl-9"
        />
      </div>
      <div className="w-full sm:w-40">
        <Select
          value={role ?? ""}
          onChange={(e) => onRoleChange(ROLE_FILTERS.find((r) => r === e.target.value))}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLE_FILTERS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-full sm:w-40">
        <Select
          value={status ?? ""}
          onChange={(e) => onStatusChange(STATUS_FILTERS.find((s) => s === e.target.value))}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
