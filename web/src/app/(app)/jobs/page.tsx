import { Suspense } from "react";
import { JobsList, JobsListSkeleton } from "@/components/jobs/jobs-list";

export default function JobsPage() {
  // JobsList reads the URL (`useSearchParams`), which must sit inside a Suspense boundary.
  return (
    <Suspense fallback={<JobsListSkeleton />}>
      <JobsList />
    </Suspense>
  );
}
