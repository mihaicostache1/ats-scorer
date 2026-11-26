import * as React from "react";
import { Briefcase, FileText, LayoutGrid, Settings2, Users } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { ScoreBreakdown, ScoreValue } from "@/components/scoring/score-breakdown";
import { Badge, StatusDot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEMO_CANDIDATES, DEMO_CV, DEMO_JOB, DEMO_SCORE, type DemoCandidate } from "./demo-data";

/** A small mono label that marks every preview as invented data. */
export function ExampleDataLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-muted-foreground border-border-strong inline-flex h-6 items-center gap-1.5 rounded-sm border border-dashed px-2 font-mono text-[10.5px] tracking-[0.06em] uppercase",
        className
      )}
    >
      Example data
    </span>
  );
}

const PARSE_BADGE: Record<DemoCandidate["parse"], "success" | "info" | "warning"> = {
  Parsed: "success",
  Processing: "info",
  "Needs review": "warning",
};

function CandidateRow({ candidate, selected }: { candidate: DemoCandidate; selected: boolean }) {
  return (
    <li
      className={cn(
        "border-border relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0",
        selected && "bg-electric-soft/60"
      )}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="bg-electric absolute inset-y-2 left-0 w-[2px] rounded-full"
        />
      )}
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-secondary text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-medium"
        >
          {candidate.initials}
        </span>
        <div className="min-w-0">
          <p className="text-foreground truncate text-[13px] font-medium">{candidate.name}</p>
          <p className="text-muted-foreground truncate text-[11.5px]">{candidate.headline}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={PARSE_BADGE[candidate.parse]} className="hidden xl:inline-flex">
          <StatusDot />
          {candidate.parse}
        </Badge>
        <ScoreValue value={candidate.score} className="w-[68px] justify-end" />
      </div>
    </li>
  );
}

/**
 * The hero centrepiece: the ranked-candidates workspace for one job, in the light appearance the
 * product ships with. Built from the same ScoreBreakdown, ScoreValue and Badge components the app
 * uses, filled with synthetic data.
 */
export function ProductPreview() {
  const selected = DEMO_CANDIDATES[0];
  return (
    <figure
      className="light bg-card text-foreground ring-ink-700/40 overflow-hidden rounded-xl shadow-[0_40px_120px_-40px_rgb(0_0_0/0.75)] ring-1"
      aria-label="Preview of the ATS Scorer workspace with example data"
    >
      {/* App header */}
      <div className="border-border flex h-11 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark className="size-5" />
          <ol className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <li className="hidden sm:block">Jobs</li>
            <li aria-hidden="true" className="hidden sm:block">
              /
            </li>
            <li className="text-foreground truncate font-medium">{DEMO_JOB.title}</li>
            <li aria-hidden="true" className="hidden md:block">
              /
            </li>
            <li className="hidden md:block">Ranked candidates</li>
          </ol>
        </div>
        <ExampleDataLabel />
      </div>

      <div className="grid md:grid-cols-[52px_minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* Icon rail */}
        <div
          aria-hidden="true"
          className="bg-background-secondary border-border hidden flex-col items-center gap-1 border-r py-3 md:flex"
        >
          {[LayoutGrid, Briefcase, Users, FileText, Settings2].map((Icon, i) => (
            <span
              key={i}
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                i === 1 ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-steel"
              )}
            >
              <Icon className="size-4" />
            </span>
          ))}
        </div>

        {/* Ranked list */}
        <div className="border-border hidden border-r md:block">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-foreground text-[13px] font-semibold">Ranked for this job</p>
              <p className="text-muted-foreground text-[11.5px]">
                {DEMO_CANDIDATES.length} applications · sorted by match
              </p>
            </div>
            <span className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
              Match
            </span>
          </div>
          <ul>
            {DEMO_CANDIDATES.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                selected={candidate.id === selected.id}
              />
            ))}
          </ul>
          <p className="text-muted-foreground border-border border-t px-4 py-3 text-[11.5px] leading-relaxed">
            Lower scores stay visible. Nobody is hidden or rejected by a number.
          </p>
        </div>

        {/* Selected candidate */}
        <div className="min-w-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <div className="min-w-0">
              <p className="text-foreground text-[15px] font-semibold tracking-tight">
                {selected.name}
              </p>
              <p className="text-muted-foreground truncate text-[12px]">{DEMO_CV.contact}</p>
            </div>
            <Badge variant="outline">Stage · {selected.stage}</Badge>
          </div>
          <div role="presentation" className="border-border flex gap-5 border-b px-5 text-[12.5px]">
            {["Overview", "Experience", "Skills", "Match"].map((tab) => (
              <span
                key={tab}
                className={cn(
                  "-mb-px border-b-2 py-2.5",
                  tab === "Match"
                    ? "border-electric text-foreground font-medium"
                    : "text-muted-foreground border-transparent"
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="px-5 py-5">
            <ScoreBreakdown score={DEMO_SCORE} jobTitle={DEMO_JOB.title} compact headingLevel={4} />
          </div>
        </div>
      </div>
    </figure>
  );
}
