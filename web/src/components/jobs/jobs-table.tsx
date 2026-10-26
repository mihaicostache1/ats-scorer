import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatEmploymentType, STATUS_BADGE } from "./job-meta";
import { JOB_PAGE_SIZE, type JobResponse } from "./use-jobs";

/**
 * Columns, in wireframe order. Candidates and Match Avg have no data in the API yet and show a
 * placeholder. On tablet widths the least important columns are hidden so the rest fit
 * without horizontal scrolling.
 */
const COLUMNS = [
  { key: "title", header: "Job title & dept" },
  { key: "location", header: "Location & type" },
  { key: "status", header: "Status" },
  { key: "candidates", header: "Candidates", className: "text-right" },
  { key: "match", header: "Match avg", className: "hidden text-right lg:table-cell" },
  { key: "created", header: "Created", className: "hidden lg:table-cell" },
] as const;

export function JobsTable({
  jobs,
  isLoading = false,
  isRefreshing = false,
  empty,
}: {
  jobs: JobResponse[];
  isLoading?: boolean;
  /** A newer page is loading; keep showing the current rows, dimmed. */
  isRefreshing?: boolean;
  /** Rendered in place of the rows when there are none. */
  empty?: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto" aria-busy={isLoading || isRefreshing}>
      <table
        className={cn("w-full text-left text-sm transition-opacity", isRefreshing && "opacity-60")}
      >
        <caption className="sr-only">Job postings</caption>
        <thead className="border-border/60 bg-foreground/[0.03] text-muted-foreground border-b font-medium">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "text-footnote h-10 px-4 font-medium whitespace-nowrap",
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
            Array.from({ length: JOB_PAGE_SIZE }).map((_, i) => (
              <SkeletonTableRow key={i} columns={COLUMNS.length} />
            ))
          ) : jobs.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="p-6">
                {empty}
              </td>
            </tr>
          ) : (
            jobs.map((job) => {
              const status = STATUS_BADGE[job.status];
              return (
                <tr
                  key={job.id}
                  className="hover:bg-foreground/[0.04] transition-colors duration-200"
                >
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-foreground focus-visible:ring-primary/25 rounded-md font-semibold hover:underline focus-visible:ring-4 focus-visible:outline-none"
                    >
                      {job.title}
                    </Link>
                    {job.department && (
                      <Badge variant="secondary" className="mt-1 font-normal">
                        {job.department}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {job.location ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="text-muted-foreground size-3.5 shrink-0" />
                        <span>{job.location}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    <div className="text-muted-foreground mt-1 text-xs">
                      {formatEmploymentType(job.employment_type)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant={status.variant}>
                      <span
                        className="mr-1.5 size-1.5 rounded-full bg-current"
                        aria-hidden="true"
                      />
                      {status.label}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right align-top">
                    <span title="Not available yet">—</span>
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 text-right align-top lg:table-cell">
                    <span title="Not available yet">—</span>
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 align-top whitespace-nowrap lg:table-cell">
                    {formatDate(job.created_at)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
