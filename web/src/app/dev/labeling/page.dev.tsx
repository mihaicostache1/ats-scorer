import { notFound } from "next/navigation";
import { FileWarning } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { LabelingTool } from "./_components/labeling-tool";
import { LabelingDataError, loadLabelingData } from "./_lib/data";
import type { LabelingData } from "./_lib/types";

/**
 * The internal labeling tool (F-13): CVs and jobs from the L-9 evaluation set, rated 0-3.
 *
 * Dev only, with two locks. The first is the file name: `page.dev.tsx` is a route only while
 * `next dev` runs (see `src/lib/dev-routes.ts` and `next.config.ts`), so in a production build the
 * route does not exist and the answer is a real 404. The second is the check below, for the day the
 * first is removed by mistake: it keeps the tool and its data from being rendered, but Next streams
 * that answer as the not-found page with status 200, so only the first lock gives a true 404. Do not
 * link to this page from the app, and do not add a `metadata` export: it would be sent even then.
 */

// Read the files on every request, so a rebuilt evaluation set shows up without a restart.
export const dynamic = "force-dynamic";

export default async function LabelingPage() {
  if (process.env.NODE_ENV === "production") notFound();

  let data: LabelingData | null = null;
  let problems: string[] = [];
  try {
    data = await loadLabelingData();
  } catch (error) {
    if (!(error instanceof LabelingDataError)) throw error;
    problems = error.problems;
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4">
        <EmptyState
          icon={FileWarning}
          title="The evaluation set is not ready"
          description={problems.join(" ")}
        />
      </main>
    );
  }
  return <LabelingTool data={data} />;
}
