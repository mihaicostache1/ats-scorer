"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX, UserPlus, Users } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildUrl, parseOneOf, parsePositiveInt } from "@/lib/url-state";
import { useSession } from "@/providers/session-provider";
import { ActionAlert } from "./action-alert";
import { InviteUserDialog } from "./invite-user-dialog";
import type { UserActionError } from "./user-errors";
import { UsersTable } from "./users-table";
import { UsersToolbar } from "./users-toolbar";
import {
  ROLE_FILTERS,
  STATUS_FILTERS,
  USER_PAGE_SIZE,
  useUsers,
  type StatusFilter,
  type UserRole,
} from "./use-users";

const SEARCH_DEBOUNCE_MS = 300;

/** Placeholder shown while the search params are read (required by `useSearchParams`). */
export function UsersListSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading users">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * Workspace users (admins only). Search text, role, status and page live in the URL
 * (`?q=&role=&status=&page=`), so the view survives a refresh and works with Back/Forward.
 */
export function UsersList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: me } = useSession();

  // URL → state (invalid values fall back to defaults).
  const q = (searchParams.get("q") ?? "").trim();
  const role = parseOneOf(searchParams.get("role"), ROLE_FILTERS);
  const status = parseOneOf(searchParams.get("status"), STATUS_FILTERS);
  const page = parsePositiveInt(searchParams.get("page"));

  const { state, refetch, replaceUser } = useUsers({ q, role, status, page });
  const [inviteOpen, setInviteOpen] = React.useState(false);
  // The last refused role change; deactivation refusals are shown inside their own dialog.
  const [actionError, setActionError] = React.useState<UserActionError | null>(null);

  const go = React.useCallback(
    (
      next: { q?: string; role?: UserRole; status?: StatusFilter; page?: number },
      mode: "push" | "replace" = "push"
    ) => {
      const url = buildUrl(pathname, {
        q: next.q ?? q,
        role: "role" in next ? next.role : role,
        status: "status" in next ? next.status : status,
        page: next.page && next.page > 1 ? next.page : undefined,
      });
      if (mode === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, q, role, status, router]
  );

  // The search box keeps its own text so typing is instant; the URL follows after a pause.
  const [searchText, setSearchText] = React.useState(q);
  const [syncedQ, setSyncedQ] = React.useState(q);
  if (q !== syncedQ) {
    // The URL changed from outside (Back/Forward, "Clear filters"): adopt it.
    setSyncedQ(q);
    setSearchText(q);
  }

  React.useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => go({ q: trimmed, page: 1 }, "replace"), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, q, go]);

  // A stale `?page=99` snaps to the last page once the API says how many there are. An empty list
  // has one (empty) page: the real API reports `total_pages: 0` for it, which must not read as
  // "past the end", or the page redirects forever and never shows its empty state.
  const totalPages =
    state.phase === "success" ? Math.max(1, state.data.pagination.total_pages) : undefined;
  React.useEffect(() => {
    if (totalPages !== undefined && page > totalPages) go({ page: totalPages }, "replace");
  }, [totalPages, page, go]);

  const filtersActive = q !== "" || role !== undefined || status !== undefined;
  const clearFilters = () => router.push(pathname, { scroll: false });

  const outOfRange = totalPages !== undefined && page > totalPages;
  const isLoading = state.phase === "loading" || outOfRange;
  const isRefreshing = state.phase === "success" && state.refreshing;
  const users = state.phase === "success" ? state.data.items : [];
  const pagination = state.phase === "success" ? state.data.pagination : undefined;

  const emptyState = filtersActive ? (
    <EmptyState
      icon={SearchX}
      title="No users match your filters"
      description="Try a different search term, role or status, or clear the filters to see everyone."
      action={
        <Button variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      }
      className="min-h-[220px] border-0"
    />
  ) : (
    <EmptyState
      icon={Users}
      title="No users yet"
      description="Invite a colleague to give them access to this workspace."
      action={<Button onClick={() => setInviteOpen(true)}>Invite user</Button>}
      className="min-h-[220px] border-0"
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Invite colleagues, change their roles and deactivate accounts. Admins manage people, recruiters run hiring, viewers have read-only access."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" />
            Invite user
          </Button>
        }
      />

      <UsersToolbar
        search={searchText}
        onSearchChange={setSearchText}
        role={role}
        onRoleChange={(value) => go({ role: value, page: 1 })}
        status={status}
        onStatusChange={(value) => go({ status: value, page: 1 })}
      />

      {actionError && <ActionAlert error={actionError} onDismiss={() => setActionError(null)} />}

      {state.phase === "error" ? (
        <ErrorState
          title="Couldn't load users"
          description="Something went wrong while fetching the workspace users."
          error={state.error}
          onRetry={refetch}
        />
      ) : (
        <div className="surface overflow-hidden rounded-xl">
          <UsersTable
            users={users}
            currentUserId={me?.id}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            empty={emptyState}
            onUserChanged={replaceUser}
            onActionError={setActionError}
          />
          {pagination && (
            <Pagination
              page={pagination.page}
              perPage={USER_PAGE_SIZE}
              totalItems={pagination.total_items}
              totalPages={pagination.total_pages}
              noun={pagination.total_items === 1 ? "user" : "users"}
              onPageChange={(next) => go({ page: next })}
              disabled={isRefreshing}
            />
          )}
        </div>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {/* Announces result changes to screen readers. */}
      <p className="sr-only" aria-live="polite">
        {pagination ? `${pagination.total_items} users found` : ""}
      </p>
    </div>
  );
}
