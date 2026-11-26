"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { listApplications, listCandidates, listJobs } from "@/api";
import { Can } from "@/components/auth/can";
import { profileStatus } from "@/components/candidates/candidates-table";
import { unwrap, useResource, type ResourceState } from "@/components/candidates/use-resource";
import { STATUS_BADGE } from "@/components/jobs/job-meta";
import type { JobResponse } from "@/components/jobs/use-jobs";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Badge, StatusDot } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, getInitials } from "@/lib/format";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

/* Everything on this page comes from the API. Nothing is estimated, trended or invented: a count
   that can't be loaded shows a dash and says so, rather than a zero. */

const total = (r: { pagination: { total_items: number } }) => r.pagination.total_items;

function Metric({
  label,
  state,
  href,
  linkLabel,
}: {
  label: string;
  state: ResourceState<number>;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-6 px-5 py-5 sm:px-6">
      <p className="text-muted-foreground text-[13px] font-medium">{label}</p>
      <div className="flex items-end justify-between gap-3">
        {state.phase === "loading" ? (
          <Skeleton className="h-10 w-16" />
        ) : state.phase === "error" ? (
          <p className="text-muted-foreground text-sm" title={state.error}>
            <span className="text-metric" aria-hidden="true">
              —
            </span>
            <span className="sr-only">Unavailable</span>
          </p>
        ) : (
          <p className="text-metric text-foreground">{state.data}</p>
        )}
        <Link
          href={href}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mr-1 inline-flex items-center gap-1 rounded-md px-1 text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {linkLabel}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function useCount(load: () => Promise<number>) {
  return useResource(load).state;
}

function MetricBand() {
  const { can } = useSession();
  const canCandidates = can("candidate:read");

  const openJobs = useCount(
    React.useCallback(
      async () => total(unwrap(await listJobs({ status: "open", per_page: 1 }))),
      []
    )
  );
  const drafts = useCount(
    React.useCallback(
      async () => total(unwrap(await listJobs({ status: "draft", per_page: 1 }))),
      []
    )
  );
  const candidates = useCount(
    React.useCallback(
      async () => (canCandidates ? total(unwrap(await listCandidates({ per_page: 1 }))) : 0),
      [canCandidates]
    )
  );
  const active = useCount(
    React.useCallback(
      async () => total(unwrap(await listApplications({ status: "active", per_page: 1 }))),
      []
    )
  );

  return (
    <section aria-label="Summary" className="border-border overflow-hidden rounded-xl border">
      <div
        className={cn(
          "bg-border [&>*]:bg-card grid grid-cols-1 gap-px",
          canCandidates ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
        )}
      >
        <Metric label="Open jobs" state={openJobs} href="/jobs?status=open" linkLabel="View" />
        <Metric label="Draft jobs" state={drafts} href="/jobs?status=draft" linkLabel="Finish" />
        {canCandidates && (
          <Metric label="Candidates" state={candidates} href="/candidates" linkLabel="Browse" />
        )}
        <Metric
          label="Active applications"
          state={active}
          href={canCandidates ? "/candidates" : "/jobs"}
          linkLabel="Review"
        />
      </div>
    </section>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-border divide-y" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 px-5 py-6 text-sm">
      <p className="text-muted-foreground">
        Couldn&apos;t load this list. <span className="sr-only">{message}</span>
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-link focus-visible:ring-ring rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Try again
      </button>
    </div>
  );
}

function OpenJobs() {
  const load = React.useCallback(
    async () =>
      unwrap(
        await listJobs({ status: "open", per_page: 6, sort_by: "updated_at", sort_order: "desc" })
      ).items,
    []
  );
  const { state, refetch } = useResource(load);

  return (
    <section aria-labelledby="open-jobs" className="space-y-3">
      <SectionHeader
        id="open-jobs"
        title="Open jobs"
        description="Roles accepting applications, most recently updated first."
        action={
          <Link
            href="/jobs?status=open"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            All jobs
            <ArrowRight aria-hidden="true" />
          </Link>
        }
      />
      <div className="surface overflow-hidden rounded-xl">
        {state.phase === "loading" ? (
          <ListSkeleton />
        ) : state.phase === "error" ? (
          <InlineError message={state.error} onRetry={refetch} />
        ) : state.data.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-foreground text-sm font-medium">No open jobs</p>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Publish a job to start receiving applications.
            </p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {state.data.map((job: JobResponse, i) => (
              <li key={job.id} style={staggerStyle(i)} className="animate-row-in">
                <Link
                  href={`/jobs/${job.id}`}
                  className="hover:bg-secondary/60 focus-visible:ring-ring grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{job.title}</p>
                    <p className="text-muted-foreground truncate text-[12.5px]">
                      {[job.department, job.location].filter(Boolean).join(" · ") ||
                        "No department"}
                    </p>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-4 text-[12.5px]">
                    <span className="hidden tabular-nums sm:inline">
                      {job.required_skills.length} required skills
                    </span>
                    <span className="hidden whitespace-nowrap md:inline">
                      Updated {formatDate(job.updated_at)}
                    </span>
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function RecentCandidates() {
  const load = React.useCallback(
    async () =>
      unwrap(await listCandidates({ per_page: 6, sort_by: "created_at", sort_order: "desc" }))
        .items,
    []
  );
  const { state, refetch } = useResource(load);
  return (
    <section aria-labelledby="recent-candidates" className="space-y-3">
      <SectionHeader
        id="recent-candidates"
        title="Recently added"
        description="Profiles that may still need a review."
      />
      <div className="surface overflow-hidden rounded-xl">
        {state.phase === "loading" ? (
          <ListSkeleton rows={4} />
        ) : state.phase === "error" ? (
          <InlineError message={state.error} onRetry={refetch} />
        ) : state.data.length === 0 ? (
          <p className="text-muted-foreground px-5 py-10 text-center text-[13px]">
            No candidates yet.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {state.data.map((candidate, i) => {
              const profile = profileStatus(candidate);
              return (
                <li key={candidate.id} style={staggerStyle(i)} className="animate-row-in">
                  <Link
                    href={`/candidates/${candidate.id}`}
                    className="hover:bg-secondary/60 focus-visible:ring-ring flex items-center gap-3 px-5 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-secondary text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-[11px] font-medium"
                    >
                      {getInitials(candidate.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {candidate.full_name}
                      </span>
                      <span className="text-muted-foreground block truncate text-[12px]">
                        Added {formatDate(candidate.created_at)}
                      </span>
                    </span>
                    <Badge variant={profile.variant}>
                      <StatusDot />
                      {profile.label}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function DraftJobs() {
  const load = React.useCallback(
    async () =>
      unwrap(
        await listJobs({ status: "draft", per_page: 4, sort_by: "updated_at", sort_order: "desc" })
      ).items,
    []
  );
  const { state, refetch } = useResource(load);
  if (state.phase === "success" && state.data.length === 0) return null;
  return (
    <section aria-labelledby="draft-jobs" className="space-y-3">
      <SectionHeader id="draft-jobs" title="Drafts" description="Not visible to applicants yet." />
      <div className="surface overflow-hidden rounded-xl">
        {state.phase === "loading" ? (
          <ListSkeleton rows={2} />
        ) : state.phase === "error" ? (
          <InlineError message={state.error} onRetry={refetch} />
        ) : (
          <ul className="divide-border divide-y">
            {state.data.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="hover:bg-secondary/60 focus-visible:ring-ring flex items-center justify-between gap-3 px-5 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span className="text-foreground min-w-0 truncate text-sm">{job.title}</span>
                  <Badge variant={STATUS_BADGE[job.status].variant}>
                    {STATUS_BADGE[job.status].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function Overview() {
  const { user, can } = useSession();
  const firstName = user?.full_name.split(/\s+/)[0];
  return (
    <div className="space-y-10">
      <PageHeader
        title="Overview"
        description={
          firstName
            ? `Welcome back, ${firstName}. Open roles, new candidates and work in progress.`
            : "Open roles, new candidates and work in progress."
        }
        actions={
          <Can action="job:write">
            <Link href="/jobs/new" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              New job
            </Link>
          </Can>
        }
      />

      <MetricBand />

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-8">
          <OpenJobs />
        </div>
        <div className="space-y-10 lg:col-span-4">
          {can("candidate:read") && <RecentCandidates />}
          <Can action="job:write">
            <DraftJobs />
          </Can>
        </div>
      </div>
    </div>
  );
}
