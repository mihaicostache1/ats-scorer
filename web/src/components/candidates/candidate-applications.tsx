"use client";

import * as React from "react";
import Link from "next/link";

import { getJob, getJobStages, listApplications } from "@/api";
import type { components } from "@/api/generated/schema";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ProfileSection, SectionBody, SectionEmpty } from "./profile-section";
import { unwrap, useResource } from "./use-resource";

type ApplicationStatus = components["schemas"]["ApplicationResponse"]["status"];

const STATUS_BADGE: Record<ApplicationStatus, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "Active", variant: "secondary" },
  hired: { label: "Hired", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

/** The most applications shown; the profile does not page them. */
const MAX_APPLICATIONS = 100;

export interface ApplicationRow {
  id: string;
  jobId: string;
  /** `null` when the job could not be loaded. */
  jobTitle: string | null;
  /** `null` when the stage could not be resolved. */
  stageName: string | null;
  status: ApplicationStatus;
  rejectionReason: string | null;
  appliedAt: string;
}

/** Applications carry only ids, so look up each distinct job's title and stage names. */
export async function loadApplicationRows(candidateId: string): Promise<ApplicationRow[]> {
  const { items } = unwrap(
    await listApplications({ candidate_id: candidateId, per_page: MAX_APPLICATIONS })
  );

  const jobIds = [...new Set(items.map((a) => a.job_id))];
  const jobs = new Map<string, { title: string | null; stages: Map<string, string> }>();
  await Promise.all(
    jobIds.map(async (id) => {
      // A job that can't be loaded shouldn't hide the application itself.
      const [job, stages] = await Promise.all([
        getJob(id).then(
          (r) => r.data ?? null,
          () => null
        ),
        getJobStages(id).then(
          (r) => r.data ?? [],
          () => []
        ),
      ]);
      jobs.set(id, {
        title: job?.title ?? null,
        stages: new Map(stages.map((s) => [s.id, s.name])),
      });
    })
  );

  return items.map((a) => {
    const job = jobs.get(a.job_id);
    return {
      id: a.id,
      jobId: a.job_id,
      jobTitle: job?.title ?? null,
      stageName: job?.stages.get(a.stage_id) ?? null,
      status: a.status,
      rejectionReason: a.rejection_reason,
      appliedAt: a.applied_at,
    };
  });
}

export function CandidateApplications({ candidateId }: { candidateId: string }) {
  const load = React.useCallback(() => loadApplicationRows(candidateId), [candidateId]);
  const { state, refetch } = useResource(load);

  return (
    <ProfileSection
      id="applications"
      title="Applications"
      description="Jobs this candidate has applied to and where they are in the pipeline."
    >
      <SectionBody state={state} label="applications" onRetry={refetch}>
        {(rows) =>
          rows.length === 0 ? (
            <SectionEmpty>Not applied to any job yet.</SectionEmpty>
          ) : (
            <ul className="divide-border divide-y">
              {rows.map((row) => {
                const status = STATUS_BADGE[row.status];
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      {row.jobTitle ? (
                        <Link
                          href={`/jobs/${row.jobId}`}
                          className="text-foreground focus-visible:ring-primary/25 rounded-md text-sm font-semibold hover:underline focus-visible:ring-4 focus-visible:outline-none"
                        >
                          {row.jobTitle}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm font-semibold">
                          Unknown job
                        </span>
                      )}
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Applied {formatDate(row.appliedAt)}
                      </p>
                      {row.rejectionReason && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          Reason: {row.rejectionReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        <span className="sr-only">Stage: </span>
                        {row.stageName ?? "Unknown stage"}
                      </Badge>
                      <Badge variant={status.variant}>
                        <span className="sr-only">Status: </span>
                        {status.label}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </SectionBody>
    </ProfileSection>
  );
}
