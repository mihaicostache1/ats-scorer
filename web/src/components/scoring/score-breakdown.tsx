import * as React from "react";
import { Check, Minus } from "lucide-react";
import type { components } from "@/api/generated/schema";
import { cn } from "@/lib/utils";

export type ScoreResponse = components["schemas"]["ScoreResponse"];

/**
 * Explainable, job-specific match score. Presentational only (no hooks), so it renders in server
 * components too: the marketing page shows it with clearly labelled example data.
 *
 * Rules it follows (docs/scope.md: "The system ranks and explains. People decide."):
 *  - A component the model did not compute is shown as "Not computed", never as 0.
 *  - Explanations, matched and missing skills come only from the score record; nothing is invented.
 *  - The score is always framed as a match for one job, not an assessment of the person.
 */

interface ComponentRow {
  key: string;
  label: string;
  description: string;
  value: number | null;
  /** Share of the overall score, 0–1, when the record says. */
  weight: number | null;
}

const COMPONENT_META: {
  key: keyof Pick<
    ScoreResponse,
    "skill_overlap_score" | "semantic_score" | "experience_score" | "title_fit_score"
  >;
  weightKey: string;
  label: string;
  description: string;
}[] = [
  {
    key: "skill_overlap_score",
    weightKey: "skill_overlap",
    label: "Skill overlap",
    description: "Required and nice-to-have skills found in the CV",
  },
  {
    key: "semantic_score",
    weightKey: "semantic",
    label: "Semantic similarity",
    description: "How closely the CV and job description relate in meaning",
  },
  {
    key: "experience_score",
    weightKey: "experience",
    label: "Experience",
    description: "Years of relevant experience against the job's minimum",
  },
  {
    key: "title_fit_score",
    weightKey: "title_fit",
    label: "Title fit",
    description: "Recent job titles against the role",
  },
];

export function scoreComponents(score: ScoreResponse): ComponentRow[] {
  const weights = score.component_breakdown.weights ?? {};
  return COMPONENT_META.map((meta) => {
    const raw = score[meta.key];
    return {
      key: meta.weightKey,
      label: meta.label,
      description: meta.description,
      value: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
      weight: typeof weights[meta.weightKey] === "number" ? weights[meta.weightKey] : null,
    };
  });
}

/** 87.5 → "88". Scores are shown as whole numbers out of 100. */
export function formatScore(value: number): string {
  return String(Math.round(Math.max(0, Math.min(100, value))));
}

/** A compact score for tables and lists. Missing scores read "Not scored", never 0. */
export function ScoreValue({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not scored</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="text-foreground font-mono text-sm font-medium tabular-nums">
        {formatScore(value)}
      </span>
      <span
        aria-hidden="true"
        className="bg-secondary hidden h-1 w-10 overflow-hidden rounded-full sm:block"
      >
        <span
          className="bg-electric block h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
    </span>
  );
}

function ComponentBar({ row }: { row: ComponentRow }) {
  const id = React.useId();
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5">
      <div className="min-w-0">
        <span id={id} className="text-foreground text-[13px] font-medium">
          {row.label}
        </span>
        {row.weight !== null && (
          <span className="text-muted-foreground ml-2 font-mono text-[11px] tabular-nums">
            weight {Math.round(row.weight * 100)}%
          </span>
        )}
      </div>
      <span className="text-foreground text-right font-mono text-[13px] tabular-nums">
        {row.value === null ? (
          <span className="text-muted-foreground font-sans text-xs">Not computed</span>
        ) : (
          formatScore(row.value)
        )}
      </span>
      <div
        className="bg-secondary col-span-2 h-1.5 overflow-hidden rounded-full"
        role={row.value === null ? undefined : "meter"}
        aria-labelledby={row.value === null ? undefined : id}
        aria-valuemin={row.value === null ? undefined : 0}
        aria-valuemax={row.value === null ? undefined : 100}
        aria-valuenow={row.value === null ? undefined : Math.round(row.value)}
      >
        {row.value === null ? (
          <div
            aria-hidden="true"
            className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_4px,transparent_4px_8px)]"
          />
        ) : (
          <div
            className="bg-electric h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }}
          />
        )}
      </div>
    </li>
  );
}

function SkillList({
  title,
  skills,
  kind,
}: {
  title: string;
  skills: string[] | undefined;
  kind: "matched" | "missing";
}) {
  return (
    <div>
      <h4 className="text-muted-foreground text-eyebrow-sm">{title}</h4>
      {skills === undefined ? (
        <p className="text-muted-foreground mt-2 text-xs">Not reported for this score.</p>
      ) : skills.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {kind === "missing" ? "No required skills missing." : "None matched."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li
              key={skill}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-xs",
                kind === "matched"
                  ? "border-electric/25 bg-electric-soft text-foreground"
                  : "border-border-strong text-muted-foreground border-dashed"
              )}
            >
              {kind === "matched" ? (
                <Check className="text-link size-3" aria-hidden="true" />
              ) : (
                <Minus className="size-3" aria-hidden="true" />
              )}
              <span className="sr-only">{kind === "matched" ? "Matched: " : "Missing: "}</span>
              {skill}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScoreBreakdown({
  score,
  jobTitle,
  className,
  compact = false,
  headingLevel = 3,
}: {
  score: ScoreResponse;
  /** The job this score belongs to, shown so it never reads as a verdict on the person. */
  jobTitle?: string | null;
  className?: string;
  /** Hides the explanations list, for tight spaces. */
  compact?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const rows = scoreComponents(score);
  const explanations = score.component_breakdown.explanations ?? [];

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-end justify-between gap-6">
        <div>
          <Heading className="text-muted-foreground text-eyebrow-sm">
            Job match{jobTitle ? "" : " score"}
          </Heading>
          {jobTitle && (
            <p className="text-foreground mt-1 text-sm font-medium break-words">{jobTitle}</p>
          )}
        </div>
        <p className="flex items-baseline gap-1 text-right">
          <span className="text-metric text-foreground font-mono">
            {formatScore(score.overall_score)}
          </span>
          <span className="text-muted-foreground font-mono text-sm">/100</span>
        </p>
      </div>

      <ul className="space-y-4" aria-label="Score components">
        {rows.map((row) => (
          <ComponentBar key={row.key} row={row} />
        ))}
      </ul>

      <div className="grid gap-5 sm:grid-cols-2">
        <SkillList
          title="Matched skills"
          skills={score.component_breakdown.matched_skills}
          kind="matched"
        />
        <SkillList
          title="Missing skills"
          skills={score.component_breakdown.missing_skills}
          kind="missing"
        />
      </div>

      {!compact && explanations.length > 0 && (
        <div>
          <h4 className="text-muted-foreground text-eyebrow-sm">Why this score</h4>
          <ul className="mt-2.5 space-y-2">
            {explanations.map((line) => (
              <li
                key={line}
                className="text-foreground/90 flex gap-2.5 text-[13px] leading-relaxed"
              >
                <span
                  aria-hidden="true"
                  className="bg-electric mt-[7px] size-1 shrink-0 rounded-full"
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        Specific to this job. A score supports your review; it does not decide.{" "}
        <span className="font-mono text-[11px]">Model {score.model_version}</span>
      </p>
    </div>
  );
}
