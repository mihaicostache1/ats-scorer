"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Info, Pencil } from "lucide-react";

import { Can } from "@/components/auth/can";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Badge, StatusDot } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatEmploymentType, STATUS_BADGE } from "./job-meta";
import { JobPipeline } from "./job-pipeline";
import { JobStatusActions } from "./job-status-actions";
import { useJob } from "./use-job";
import type { JobResponse } from "./use-jobs";

export function JobDetailSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading job">
      <div className="space-y-3">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="grid gap-8 lg:grid-cols-12">
        <Skeleton className="h-80 w-full rounded-xl lg:col-span-8" />
        <Skeleton className="h-64 w-full rounded-xl lg:col-span-4" />
      </div>
    </div>
  );
}

function SkillList({
  title,
  skills,
  tone,
}: {
  title: string;
  skills: string[];
  tone: "required" | "preferred";
}) {
  const id = `${tone}-skills-heading`;
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-muted-foreground text-eyebrow-sm">
        {title}
        <span className="ml-2 tabular-nums">{skills.length}</span>
      </h3>
      {skills.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">None specified.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li key={skill}>
              <Badge
                variant={tone === "required" ? "outline" : "secondary"}
                className="h-6 px-2 text-[12.5px] font-normal"
              >
                {skill}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground text-[13px]">{label}</dt>
      <dd className="text-foreground text-right text-[13px]">{children}</dd>
    </div>
  );
}

function JobDetailView({
  job,
  onChanged,
}: {
  job: JobResponse;
  onChanged: (job: JobResponse, action: "close" | "archive") => void;
}) {
  const status = STATUS_BADGE[job.status];
  const none = <span className="text-muted-foreground">—</span>;

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/jobs", label: "Back to jobs", text: "Jobs" }}
        title={job.title}
        meta={
          <>
            <Badge variant={status.variant}>
              <StatusDot />
              {status.label}
            </Badge>
            <span className="text-muted-foreground text-[13px]">
              {[job.department, job.location, formatEmploymentType(job.employment_type)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        }
        actions={
          <Can action="job:write">
            {job.status !== "archived" && (
              <Link
                href={`/jobs/${job.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            <JobStatusActions job={job} onChanged={onChanged} />
          </Can>
        }
      />

      {(job.status === "closed" || job.status === "archived") && (
        <p
          role="status"
          className="border-border bg-background-secondary flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
        >
          <Info className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          {job.status === "closed"
            ? "This job is closed and no longer accepts new applications."
            : "This job is archived and hidden from the jobs list."}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-8">
          <section aria-labelledby="requirements-heading" className="surface rounded-xl">
            <h2
              id="requirements-heading"
              className="border-border text-foreground border-b px-6 py-3.5 text-[14px] font-semibold"
            >
              Qualifications
            </h2>
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              <SkillList title="Required skills" skills={job.required_skills} tone="required" />
              <SkillList
                title="Nice-to-have skills"
                skills={job.preferred_skills}
                tone="preferred"
              />
            </div>
            <p className="text-muted-foreground border-border border-t px-6 py-3 text-xs">
              Candidates are matched against these skills. Required skills count more.
            </p>
          </section>

          <section aria-labelledby="description-heading" className="space-y-3">
            <h2 id="description-heading" className="text-foreground text-title-3">
              Description
            </h2>
            <p className="text-foreground/90 max-w-[70ch] text-[15px] leading-relaxed whitespace-pre-wrap">
              {job.description}
            </p>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section aria-labelledby="details-heading" className="surface rounded-xl">
            <h2
              id="details-heading"
              className="border-border text-foreground border-b px-5 py-3.5 text-[14px] font-semibold"
            >
              Details
            </h2>
            <dl className="divide-border divide-y px-5 py-1">
              <Fact label="Location">{job.location ?? none}</Fact>
              <Fact label="Employment type">{formatEmploymentType(job.employment_type)}</Fact>
              <Fact label="Minimum experience">
                {job.min_experience_years
                  ? `${job.min_experience_years} ${job.min_experience_years === 1 ? "year" : "years"}`
                  : "Not required"}
              </Fact>
              <Fact label="Created">{formatDate(job.created_at)}</Fact>
              <Fact label="Last updated">{formatDate(job.updated_at)}</Fact>
            </dl>
          </section>
          <JobPipeline jobId={job.id} />
        </div>
      </div>
    </div>
  );
}

export function JobDetail({ id }: { id: string }) {
  const router = useRouter();
  const { state, refetch, setJob } = useJob(id);

  if (state.phase === "loading") return <JobDetailSkeleton />;

  if (state.phase === "error") {
    return state.notFound ? (
      <EmptyState
        icon={Briefcase}
        title="Job not found"
        description="It may have been removed, or the link is wrong."
        action={
          <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
            Back to jobs
          </Link>
        }
      />
    ) : (
      <ErrorState
        title="Couldn't load this job"
        description="Something went wrong while fetching the job."
        error={state.error}
        onRetry={refetch}
        action={
          <Link href="/jobs" className={buttonVariants({ variant: "ghost" })}>
            Back to jobs
          </Link>
        }
      />
    );
  }

  return (
    <JobDetailView
      job={state.job}
      onChanged={(job, action) => {
        if (action === "archive") router.push("/jobs");
        else setJob(job);
      }}
    />
  );
}
