"use client";

import * as React from "react";
import { getJobStages, listApplications } from "@/api";
import { unwrap, useResource } from "@/components/candidates/use-resource";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The job's pipeline: its stages in order, with how many active applications sit in each. Both
 * come from the API (`/jobs/{id}/stages`, `/applications?job_id=`); nothing is estimated.
 */
export function JobPipeline({ jobId }: { jobId: string }) {
  const load = React.useCallback(async () => {
    const [stages, applications] = await Promise.all([
      getJobStages(jobId).then(unwrap),
      listApplications({ job_id: jobId, per_page: 100 }).then(unwrap),
    ]);
    const perStage = new Map<string, number>();
    for (const app of applications.items) {
      perStage.set(app.stage_id, (perStage.get(app.stage_id) ?? 0) + 1);
    }
    return {
      stages: [...stages].sort((a, b) => a.stage_order - b.stage_order),
      perStage,
      total: applications.pagination.total_items,
      partial: applications.pagination.total_items > applications.items.length,
    };
  }, [jobId]);
  const { state, refetch } = useResource(load);

  return (
    <section aria-labelledby="pipeline-heading" className="surface rounded-xl">
      <div className="border-border flex items-baseline justify-between border-b px-5 py-3.5">
        <h2 id="pipeline-heading" className="text-foreground text-[14px] font-semibold">
          Pipeline
        </h2>
        {state.phase === "success" && (
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {state.data.total} {state.data.total === 1 ? "application" : "applications"}
          </p>
        )}
      </div>
      {state.phase === "loading" ? (
        <div className="space-y-2 p-5" role="status" aria-label="Loading pipeline">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : state.phase === "error" ? (
        <div role="alert" className="flex items-center justify-between gap-3 px-5 py-4 text-sm">
          <span className="text-muted-foreground">Couldn&apos;t load the pipeline.</span>
          <button
            type="button"
            onClick={refetch}
            className="text-link focus-visible:ring-ring rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Try again
          </button>
        </div>
      ) : state.data.stages.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-sm">No stages configured.</p>
      ) : (
        <ol className="px-5 py-2">
          {state.data.stages.map((stage, i) => {
            const count = state.data.perStage.get(stage.id) ?? 0;
            return (
              <li
                key={stage.id}
                className="border-border flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
              >
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground w-4 font-mono text-[11px] tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{stage.name}</span>
                </span>
                <span
                  className={
                    count > 0
                      ? "text-foreground font-mono text-[13px] tabular-nums"
                      : "text-muted-foreground font-mono text-[13px] tabular-nums"
                  }
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {state.phase === "success" && state.data.partial && (
        <p className="text-muted-foreground border-border border-t px-5 py-3 text-xs">
          Counts cover the first 100 applications.
        </p>
      )}
    </section>
  );
}
