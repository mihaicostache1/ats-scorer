import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { readParsedSummary } from "./parsed-cv";
import { CANDIDATE_PAGE_SIZE, type CandidateResponse } from "./use-candidates";

const MAX_SKILLS_SHOWN = 3;

/**
 * Columns, in reading order. Skills and the added date drop out on narrower screens so the rest fit
 * without horizontal scrolling.
 */
const COLUMNS = [
  { key: "candidate", header: "Candidate" },
  { key: "location", header: "Location" },
  { key: "phone", header: "Phone", className: "hidden md:table-cell" },
  { key: "skills", header: "Top skills", className: "hidden lg:table-cell" },
  { key: "added", header: "Added", className: "hidden lg:table-cell" },
] as const;

const none = <span className="text-muted-foreground">—</span>;

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
      <table
        className={cn("w-full text-left text-sm transition-opacity", isRefreshing && "opacity-60")}
      >
        <caption className="sr-only">Candidates</caption>
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
            candidates.map((candidate) => {
              const skills = readParsedSummary(candidate.parsed_data)?.skills ?? [];
              return (
                <tr
                  key={candidate.id}
                  className="hover:bg-foreground/[0.04] transition-colors duration-200"
                >
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/candidates/${candidate.id}`}
                      className="text-foreground focus-visible:ring-primary/25 rounded-md font-semibold hover:underline focus-visible:ring-4 focus-visible:outline-none"
                    >
                      {candidate.full_name}
                    </Link>
                    <div className="text-muted-foreground mt-0.5 text-xs break-all">
                      {candidate.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {candidate.location ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin
                          className="text-muted-foreground size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{candidate.location}</span>
                      </div>
                    ) : (
                      none
                    )}
                  </td>
                  <td className="hidden px-4 py-3 align-top whitespace-nowrap md:table-cell">
                    {candidate.phone ?? none}
                  </td>
                  <td className="hidden px-4 py-3 align-top lg:table-cell">
                    {skills.length === 0 ? (
                      none
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {skills.slice(0, MAX_SKILLS_SHOWN).map((skill) => (
                          <Badge key={skill} variant="secondary" className="font-normal">
                            {skill}
                          </Badge>
                        ))}
                        {skills.length > MAX_SKILLS_SHOWN && (
                          <span className="text-muted-foreground self-center text-xs">
                            +{skills.length - MAX_SKILLS_SHOWN}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 align-top whitespace-nowrap lg:table-cell">
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
