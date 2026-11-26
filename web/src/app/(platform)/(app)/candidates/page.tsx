import { Suspense } from "react";
import { CandidateAccess } from "@/components/candidates/candidate-access";
import { CandidatesList, CandidatesListSkeleton } from "@/components/candidates/candidates-list";

export default function CandidatesPage() {
  // CandidatesList reads the URL (`useSearchParams`), which must sit inside a Suspense boundary.
  return (
    <CandidateAccess>
      <Suspense fallback={<CandidatesListSkeleton />}>
        <CandidatesList />
      </Suspense>
    </CandidateAccess>
  );
}
