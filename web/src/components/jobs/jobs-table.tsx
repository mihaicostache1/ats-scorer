import * as React from "react";
import Link from "next/link";
import { Badge, StatusDot } from "@/components/ui/badge";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatDate, formatEmploymentType, STATUS_BADGE } from "./job-meta";
import { JOB_PAGE_SIZE, type JobResponse } from "./use-jobs";

/** Shared table styles, so every list in the workspace reads the same way. */
export const TABLE = {
  table: "w-full text-left text-sm",
  head: "border-border bg-background-secondary/60 text-muted-foreground border-b",
  th: "h-9 px-4 text-[12px] font-medium whitespace-nowrap first:pl-5 last:pr-5",
  row: "animate-row-in hover:bg-secondary/50 transition-colors duration-(--motion-fast)",
  td: "px-4 py-3 align-middle first:pl-5 last:pr-5",
  link: "text-foreground focus-visible:ring-ring rounded-sm font-medium hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:outline-none",
};

const MAX_SKILLS_SHOWN = 2;

/**
 * Only fields the API provides. Candidate counts and match averages are not in the jobs contract,
 * so they are not shown as columns full of dashes. Lower-priority columns drop out on narrow screens.
 */
const COLUMNS = [
  { key: "title", header: "Job" },
  { key: "status", header: "Status" },
  { key: "type", header: "Type", className: "hidden md:table-cell" },
  { key: "skills", header: "Required skills", className: "hidden lg:table-cell" },
  { key: "updated", header: "Updated", className: "hidden sm:table-cell text-right" },
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
      <table className={cn(TABLE.table, "transition-opacity", isRefreshing && "opacity-60")}>
        <caption className="sr-only">Job postings</caption>
        <thead className={TABLE.head}>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(TABLE.th, "className" in col && col.className)}
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
            jobs.map((job, index) => {
              const status = STATUS_BADGE[job.status];
              const skills = job.required_skills;
              return (
                <tr key={job.id} style={staggerStyle(index)} className={TABLE.row}>
                  <td className={TABLE.td}>
                    <Link href={`/jobs/${job.id}`} className={TABLE.link}>
                      {job.title}
                    </Link>
                    <div className="text-muted-foreground mt-0.5 text-[12.5px]">
                      {[job.department, job.location].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className={TABLE.td}>
                    <Badge variant={status.variant}>
                      <StatusDot />
                      {status.label}
                    </Badge>
                  </td>
                  <td className={cn(TABLE.td, "text-muted-foreground hidden md:table-cell")}>
                    {formatEmploymentType(job.employment_type)}
                  </td>
                  <td className={cn(TABLE.td, "hidden lg:table-cell")}>
                    {skills.length === 0 ? (
                      <span className="text-muted-foreground">None listed</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {skills.slice(0, MAX_SKILLS_SHOWN).map((skill) => (
                          <Badge key={skill} variant="secondary" className="font-normal">
                            {skill}
                          </Badge>
                        ))}
                        {skills.length > MAX_SKILLS_SHOWN && (
                          <span className="text-muted-foreground font-mono text-xs">
                            +{skills.length - MAX_SKILLS_SHOWN}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      TABLE.td,
                      "text-muted-foreground hidden text-right whitespace-nowrap tabular-nums sm:table-cell"
                    )}
                  >
                    {formatDate(job.updated_at)}
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
