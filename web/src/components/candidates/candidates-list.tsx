"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX, Users } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildUrl, parsePositiveInt } from "@/lib/url-state";
import { CandidatesTable } from "./candidates-table";
import { CandidatesToolbar } from "./candidates-toolbar";
import { CANDIDATE_PAGE_SIZE, useCandidates } from "./use-candidates";

const SEARCH_DEBOUNCE_MS = 300;

/** Placeholder shown while the search params are read (required by `useSearchParams`). */
export function CandidatesListSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading candidates">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * Candidates list. Search text and page live in the URL (`?q=&page=`), so the view survives a
 * refresh, can be shared, and works with Back/Forward.
 */
export function CandidatesList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL → state (invalid values fall back to defaults).
  const q = (searchParams.get("q") ?? "").trim();
  const page = parsePositiveInt(searchParams.get("page"));

  const { state, refetch } = useCandidates({ q, page });

  const go = React.useCallback(
    (next: { q?: string; page?: number }, mode: "push" | "replace" = "push") => {
      const url = buildUrl(pathname, {
        q: next.q ?? q,
        page: next.page && next.page > 1 ? next.page : undefined,
      });
      if (mode === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, q, router]
  );

  // The search box keeps its own text so typing is instant; the URL follows after a pause.
  const [searchText, setSearchText] = React.useState(q);
  const [syncedQ, setSyncedQ] = React.useState(q);
  if (q !== syncedQ) {
    // The URL changed from outside (Back/Forward, "Clear search"): adopt it.
    setSyncedQ(q);
    setSearchText(q);
  }

  React.useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => go({ q: trimmed, page: 1 }, "replace"), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, q, go]);

  // A stale `?page=99` snaps to the last page once the API says how many there are.
  const totalPages = state.phase === "success" ? state.data.pagination.total_pages : undefined;
  React.useEffect(() => {
    if (totalPages !== undefined && page > totalPages) go({ page: totalPages }, "replace");
  }, [totalPages, page, go]);

  const searching = q !== "";
  const clearSearch = () => router.push(pathname, { scroll: false });

  // A page past the end (stale `?page=99`) is about to be corrected; show loading, not "no results".
  const outOfRange = totalPages !== undefined && page > totalPages;
  const isLoading = state.phase === "loading" || outOfRange;
  const isRefreshing = state.phase === "success" && state.refreshing;
  const candidates = state.phase === "success" ? state.data.items : [];
  const pagination = state.phase === "success" ? state.data.pagination : undefined;

  const emptyState = searching ? (
    <EmptyState
      icon={SearchX}
      title="No candidates match your search"
      description="Try a different name or email, or clear the search to see every candidate."
      action={
        <Button variant="outline" onClick={clearSearch}>
          Clear search
        </Button>
      }
      className="min-h-[220px] border-0"
    />
  ) : (
    <EmptyState
      icon={Users}
      title="No candidates yet"
      description="Candidates appear here once they are added to your organization."
      className="border-2 p-12"
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-large-title">Candidates</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Search everyone in your organization and open a profile to see applications and CVs.
        </p>
      </div>

      <CandidatesToolbar search={searchText} onSearchChange={setSearchText} />

      {state.phase === "error" ? (
        <ErrorState
          title="Couldn't load candidates"
          description="Something went wrong while fetching candidates."
          error={state.error}
          onRetry={refetch}
        />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <CandidatesTable
            candidates={candidates}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            empty={emptyState}
          />
          {pagination && (
            <Pagination
              page={pagination.page}
              perPage={CANDIDATE_PAGE_SIZE}
              totalItems={pagination.total_items}
              totalPages={pagination.total_pages}
              noun={pagination.total_items === 1 ? "candidate" : "candidates"}
              onPageChange={(next) => go({ page: next })}
              disabled={isRefreshing}
            />
          )}
        </div>
      )}

      {/* Announces result changes to screen readers. */}
      <p className="sr-only" aria-live="polite">
        {pagination ? `${pagination.total_items} candidates found` : ""}
      </p>
    </div>
  );
}
