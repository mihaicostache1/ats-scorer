"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Briefcase, Plus, SearchX } from "lucide-react";

import { Can } from "@/components/auth/can";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Pagination } from "@/components/common/pagination";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildUrl, parseOneOf, parsePositiveInt } from "@/lib/url-state";
import { PageHeader } from "@/components/layout/page-header";
import { JobsTable } from "./jobs-table";
import { JobsToolbar, STATUS_FILTERS } from "./jobs-toolbar";
import { JOB_PAGE_SIZE, useJobs } from "./use-jobs";

const SEARCH_DEBOUNCE_MS = 300;

/** Wireframe action: "+ Create Job" → the job form. */
function NewJobLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/jobs/new" className={buttonVariants()}>
      <Plus aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Placeholder shown while the search params are read (required by `useSearchParams`). */
export function JobsListSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading jobs">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-9 w-full max-w-lg" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

/**
 * Jobs list. Search text, status filter and page live in the URL (`?q=&status=&page=`), so the
 * view survives a refresh, can be shared, and works with Back/Forward.
 */
export function JobsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL → state (invalid values fall back to defaults).
  const q = (searchParams.get("q") ?? "").trim();
  const status = parseOneOf(searchParams.get("status"), STATUS_FILTERS);
  const page = parsePositiveInt(searchParams.get("page"));

  const { state, refetch } = useJobs({ q, status, page });

  const go = React.useCallback(
    (next: { q?: string; status?: string; page?: number }, mode: "push" | "replace" = "push") => {
      const url = buildUrl(pathname, {
        q: next.q ?? q,
        status: "status" in next ? next.status : status,
        page: next.page && next.page > 1 ? next.page : undefined,
      });
      if (mode === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, q, status, router]
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

  const filtersActive = q !== "" || status !== undefined;
  const clearFilters = () => router.push(pathname, { scroll: false });

  // A page past the end (stale `?page=99`) is about to be corrected; show loading, not "no jobs".
  const outOfRange = totalPages !== undefined && page > totalPages;
  const isLoading = state.phase === "loading" || outOfRange;
  const isRefreshing = state.phase === "success" && state.refreshing;
  const jobs = state.phase === "success" ? state.data.items : [];
  const pagination = state.phase === "success" ? state.data.pagination : undefined;

  const emptyState = filtersActive ? (
    <EmptyState
      icon={SearchX}
      title="No jobs match your filters"
      description="Try a different search term or status, or clear the filters to see every job."
      action={
        <Button variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      }
      className="min-h-[220px] border-0"
    />
  ) : (
    <EmptyState
      icon={Briefcase}
      title="No jobs created yet"
      description="Create a job with its required and nice-to-have skills. Candidates are matched against what you write here."
      action={
        <Can action="job:write">
          <NewJobLink>Create your first job</NewJobLink>
        </Can>
      }
      className="border-0"
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Every role in your organization, its requirements and where it stands."
        actions={
          <Can action="job:write">
            <NewJobLink>New job</NewJobLink>
          </Can>
        }
      >
        <JobsToolbar
          search={searchText}
          onSearchChange={setSearchText}
          status={status}
          onStatusChange={(value) => go({ status: value, page: 1 })}
          total={pagination?.total_items}
        />
      </PageHeader>

      {state.phase === "error" ? (
        <ErrorState
          title="Couldn't load jobs"
          description="Something went wrong while fetching job postings."
          error={state.error}
          onRetry={refetch}
        />
      ) : (
        <div className="surface overflow-hidden rounded-xl">
          <JobsTable
            jobs={jobs}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            empty={emptyState}
          />
          {pagination && (
            <Pagination
              page={pagination.page}
              perPage={JOB_PAGE_SIZE}
              totalItems={pagination.total_items}
              totalPages={pagination.total_pages}
              noun={pagination.total_items === 1 ? "job" : "jobs"}
              onPageChange={(next) => go({ page: next })}
              disabled={isRefreshing}
            />
          )}
        </div>
      )}

      {/* Announces result changes to screen readers. */}
      <p className="sr-only" aria-live="polite">
        {pagination ? `${pagination.total_items} jobs found` : ""}
      </p>
    </div>
  );
}
