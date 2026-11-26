"use client";

import * as React from "react";
import { UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { getInitials } from "@/lib/format";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DeactivateUserDialog } from "./deactivate-user-dialog";
import type { UserActionError } from "./user-errors";
import { UserRoleSelect } from "./user-role-select";
import { USER_PAGE_SIZE, type UserProfile } from "./use-users";

const COLUMNS = [
  { key: "user", header: "User" },
  { key: "role", header: "Role" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions", className: "text-right" },
] as const;

export function UsersTable({
  users,
  currentUserId,
  isLoading = false,
  isRefreshing = false,
  empty,
  onUserChanged,
  onActionError,
}: {
  users: UserProfile[];
  /** The signed-in admin; their row is marked "You". */
  currentUserId: string | undefined;
  isLoading?: boolean;
  /** A newer page is loading; keep showing the current rows, dimmed. */
  isRefreshing?: boolean;
  /** Rendered in place of the rows when there are none. */
  empty?: React.ReactNode;
  /** Called with the updated user after a role change or deactivation. */
  onUserChanged: (user: UserProfile) => void;
  /** Called with the reason when the API refuses a role change. */
  onActionError: (error: UserActionError | null) => void;
}) {
  // `target` outlives `open` so the dialog keeps its text while it animates closed.
  const [target, setTarget] = React.useState<UserProfile | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const askToDeactivate = (user: UserProfile) => {
    onActionError(null);
    setTarget(user);
    setDialogOpen(true);
  };

  return (
    <div className="overflow-x-auto" aria-busy={isLoading || isRefreshing}>
      <table
        className={cn("w-full text-left text-sm transition-opacity", isRefreshing && "opacity-60")}
      >
        <caption className="sr-only">Workspace users</caption>
        <thead className="border-border bg-background-secondary/60 text-muted-foreground border-b">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "h-9 px-4 text-[12px] font-medium whitespace-nowrap first:pl-5 last:pr-5",
                  "className" in col && col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {isLoading ? (
            Array.from({ length: USER_PAGE_SIZE }).map((_, i) => (
              <SkeletonTableRow key={i} columns={COLUMNS.length} />
            ))
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="p-6">
                {empty}
              </td>
            </tr>
          ) : (
            users.map((user, index) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr
                  key={user.id}
                  style={staggerStyle(index)}
                  className="animate-row-in hover:bg-foreground/[0.04] transition-colors duration-(--motion-base)"
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-3">
                      <span
                        className="bg-primary/10 text-link flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        aria-hidden="true"
                      >
                        {getInitials(user.full_name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground truncate font-semibold">
                            {user.full_name}
                          </span>
                          {isSelf && (
                            <Badge variant="outline" className="font-normal">
                              You
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <UserRoleSelect
                      user={user}
                      onChanged={(updated) => {
                        onActionError(null);
                        onUserChanged(updated);
                      }}
                      onError={onActionError}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Badge variant={user.is_active ? "success" : "secondary"}>
                      <span
                        className="mr-1.5 size-1.5 rounded-full bg-current"
                        aria-hidden="true"
                      />
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    {user.is_active && (
                      // Stays enabled on your own row: trying it explains why it isn't allowed.
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => askToDeactivate(user)}
                        aria-label={`Deactivate ${user.full_name}`}
                      >
                        <UserX className="size-4" aria-hidden="true" />
                        Deactivate
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <DeactivateUserDialog
        user={target}
        currentUserId={currentUserId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDeactivated={onUserChanged}
      />
    </div>
  );
}
