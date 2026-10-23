"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { buttonVariants } from "@/components/ui/button";
import { JobDetailSkeleton } from "./job-detail";
import { JobForm } from "./job-form";
import { useJob } from "./use-job";

/** Loads the job, then shows the form pre-filled. */
export function JobEdit({ id }: { id: string }) {
  const { state, refetch } = useJob(id);

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
      />
    );
  }

  // Archived jobs are read-only.
  if (state.job.status === "archived") {
    return (
      <EmptyState
        icon={Briefcase}
        title="This job is archived"
        description="Archived jobs can't be edited."
        action={
          <Link href={`/jobs/${id}`} className={buttonVariants({ variant: "outline" })}>
            Back to job
          </Link>
        }
      />
    );
  }

  return <JobForm job={state.job} />;
}
