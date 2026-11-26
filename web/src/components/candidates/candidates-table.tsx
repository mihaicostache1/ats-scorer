import * as React from "react";
import Link from "next/link";
import { TABLE } from "@/components/jobs/jobs-table";
import { Badge, StatusDot, type BadgeProps } from "@/components/ui/badge";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { formatDate, getInitials } from "@/lib/format";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { readParsedSummary } from "./parsed-cv";
import { CANDIDATE_PAGE_SIZE, type CandidateResponse } from "./use-candidates";

const MAX_SKILLS_SHOWN = 3;

/**
 * Columns, in reading order. Everything shown comes from the candidate record: there is no
 * cross-job score on a candidate (scores belong to an application for one job), so none is shown.
 * Lower-priority columns drop out on narrower screens.
 */
const COLUMNS = [
  { key: "candidate", header: "Candidate" },
  { key: "profile", header: "Profile" },
  { key: "headline", header: "Headline", className: "hidden xl:table-cell" },
  { key: "skills", header: "Top skills", className: "hidden lg:table-cell" },
  { key: "location", header: "Location", className: "hidden md:table-cell" },
  { key: "added", header: "Added", className: "hidden sm:table-cell text-right" },
] as const;

const none = <span className="text-muted-foreground">—</span>;

/** Where the candidate's profile stands, from the data on the record. */
export function profileStatus(candidate: CandidateResponse): {
  label: string;
  variant: BadgeProps["variant"];
} {
  if (candidate.parsed_profile_reviewed_at) return { label: "Reviewed", variant: "success" };
  // Same soft green as a parsed CV (cv-status.ts): Cobalt is the brand accent, not a status.
  if (readParsedSummary(candidate.parsed_data)) return { label: "Parsed", variant: "success" };
  return { label: "Not parsed", variant: "secondary" };
}

export function CandidatesTable({
  candidates,
  isLoading = false,
  isRefreshing = false,
  empty,
}: {
  candidates: CandidateResponse[];
  isLoading?: boolean;
  /** A newer page is loading; keep showing the current rows, dimmed. */
  isRefreshing?: boolean;
  /** Rendered in place of the rows when there are none. */
  empty?: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto" aria-busy={isLoading || isRefreshing}>
      <table className={cn(TABLE.table, "transition-opacity", isRefreshing && "opacity-60")}>
        <caption className="sr-only">Candidates</caption>
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
            Array.from({ length: CANDIDATE_PAGE_SIZE }).map((_, i) => (
              <SkeletonTableRow key={i} columns={COLUMNS.length} />
            ))
          ) : candidates.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="p-6">
                {empty}
              </td>
            </tr>
          ) : (
            candidates.map((candidate, index) => {
              const parsed = readParsedSummary(candidate.parsed_data);
              const skills = parsed?.skills ?? [];
              const status = profileStatus(candidate);
              return (
                <tr key={candidate.id} style={staggerStyle(index)} className={TABLE.row}>
                  <td className={TABLE.td}>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-secondary text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-[10.5px] font-medium"
                      >
                        {getInitials(candidate.full_name)}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/candidates/${candidate.id}`} className={TABLE.link}>
                          {candidate.full_name}
                        </Link>
                        <div className="text-muted-foreground truncate text-[12.5px]">
                          {candidate.email}
                        </div>
                      </div>
                    </div>
                    {!!candidate.possible_duplicates?.length && (
                      <Badge variant="warning" className="mt-1">
                        Possible duplicate
                      </Badge>
                    )}
                  </td>
                  <td className={TABLE.td}>
                    <Badge variant={status.variant}>
                      <StatusDot />
                      {status.label}
                    </Badge>
                  </td>
                  <td className={cn(TABLE.td, "hidden max-w-56 xl:table-cell")}>
                    {parsed?.headline ? (
                      <span className="text-foreground/90 line-clamp-1">{parsed.headline}</span>
                    ) : (
                      none
                    )}
                  </td>
                  <td className={cn(TABLE.td, "hidden lg:table-cell")}>
                    {skills.length === 0 ? (
                      none
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
                  <td className={cn(TABLE.td, "text-muted-foreground hidden md:table-cell")}>
                    {candidate.location ?? none}
                  </td>
                  <td
                    className={cn(
                      TABLE.td,
                      "text-muted-foreground hidden text-right whitespace-nowrap tabular-nums sm:table-cell"
                    )}
                  >
                    {formatDate(candidate.created_at)}
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
