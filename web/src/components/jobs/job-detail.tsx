"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, MapPin, Pencil } from "lucide-react";

import { Can } from "@/components/auth/can";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatEmploymentType, STATUS_BADGE } from "./job-meta";
import { JobStatusActions } from "./job-status-actions";
import { useJob } from "./use-job";
import type { JobResponse } from "./use-jobs";

const backLink =
  "text-muted-foreground hover:text-foreground focus-visible:ring-primary/25 inline-flex items-center gap-1.5 rounded-md text-sm focus-visible:ring-4 focus-visible:outline-none";

export function JobDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" role="status" aria-label="Loading job">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function SkillList({ title, skills }: { title: string; skills: string[] }) {
  return (
    <section aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`} className="text-foreground text-sm font-semibold">
        {title}
      </h2>
      {skills.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">None specified.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li key={skill}>
              <Badge variant="secondary">{skill}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-footnote font-medium">{label}</dt>
      <dd className="text-foreground mt-1 text-sm">{children}</dd>
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/jobs" className={backLink}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to jobs
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-large-title break-words">{job.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={status.variant}>
                <span className="mr-1.5 size-1.5 rounded-full bg-current" aria-hidden="true" />
                {status.label}
              </Badge>
              {job.department && (
                <Badge variant="secondary" className="font-normal">
                  {job.department}
                </Badge>
              )}
            </div>
          </div>
          <Can action="job:write">
            <div className="flex flex-wrap gap-2">
              {job.status !== "archived" && (
                <Link
                  href={`/jobs/${job.id}/edit`}
                  className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Link>
              )}
              <JobStatusActions job={job} onChanged={onChanged} />
            </div>
          </Can>
        </div>
      </div>

      {(job.status === "closed" || job.status === "archived") && (
        <p role="status" className="glass-subtle rounded-lg px-4 py-3 text-sm">
          {job.status === "closed"
            ? "This job is closed and no longer accepts new applications."
            : "This job is archived and hidden from the jobs list."}
        </p>
      )}

      <dl className="glass grid gap-5 rounded-2xl p-6 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Location">
          {job.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="text-muted-foreground size-3.5" aria-hidden="true" />
              {job.location}
            </span>
          ) : (
            none
          )}
        </Fact>
        <Fact label="Employment type">{formatEmploymentType(job.employment_type)}</Fact>
        <Fact label="Minimum experience">
          {job.min_experience_years
            ? `${job.min_experience_years} ${job.min_experience_years === 1 ? "year" : "years"}`
            : "Not required"}
        </Fact>
        <Fact label="Created">{formatDate(job.created_at)}</Fact>
        <Fact label="Last updated">{formatDate(job.updated_at)}</Fact>
      </dl>

      <section className="glass space-y-3 rounded-2xl p-6">
        <h2 className="text-foreground text-sm font-semibold">Description</h2>
        <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
          {job.description}
        </p>
      </section>

      <div className="glass space-y-5 rounded-2xl p-6">
        <SkillList title="Required skills" skills={job.required_skills} />
        <SkillList title="Nice-to-have skills" skills={job.preferred_skills} />
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
