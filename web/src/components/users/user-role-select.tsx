"use client";

import * as React from "react";
import { changeUserRole } from "@/api";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { describeUserActionError, NETWORK_ACTION_ERROR, type UserActionError } from "./user-errors";
import { ROLE_FILTERS, ROLE_LABELS, type UserProfile, type UserRole } from "./use-users";

/**
 * Role picker for one row. It is controlled by the saved role, so when the API refuses a change
 * (for example demoting the last admin) the select simply snaps back to what is saved, and the
 * reason is handed to `onError`.
 */
export function UserRoleSelect({
  user,
  onChanged,
  onError,
}: {
  user: UserProfile;
  onChanged: (user: UserProfile) => void;
  onError: (error: UserActionError) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const change = async (role: UserRole) => {
    if (role === user.role) return;
    setBusy(true);
    try {
      const { data, error, response } = await changeUserRole(user.id, { role });
      if (!data) {
        onError(describeUserActionError("role", error, response.status));
        return;
      }
      onChanged(data);
      toast.success(
        `${data.full_name} is now ${ROLE_LABELS[data.role as UserRole]}.`,
        "Role updated"
      );
    } catch {
      onError(NETWORK_ACTION_ERROR);
    } finally {
      setBusy(false);
    }
  };

  // The width goes on a wrapper: Select places its chevron against its own full-width box.
  return (
    <div className="w-36">
      <Select
        value={user.role}
        disabled={busy || !user.is_active}
        onChange={(e) => {
          const role = ROLE_FILTERS.find((r) => r === e.target.value);
          if (role) void change(role);
        }}
        aria-label={`Change role for ${user.full_name}`}
        className="h-9"
      >
        {ROLE_FILTERS.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
    </div>
  );
}
