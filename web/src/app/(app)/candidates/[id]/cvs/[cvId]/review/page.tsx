import Link from "next/link";
import { FileSearch } from "lucide-react";

import { CandidateAccess } from "@/components/candidates/candidate-access";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";

/** Placeholder so the "Review" link on a parsed CV has somewhere to go. F-11 builds the real screen. */
export default async function CvReviewPage({
  params,
}: PageProps<"/candidates/[id]/cvs/[cvId]/review">) {
  const { id } = await params;
  return (
    <CandidateAccess>
      <EmptyState
        icon={FileSearch}
        title="CV review is coming soon"
        description="You'll be able to check the parsed fields against the original PDF and correct them here."
        action={
          <Link href={`/candidates/${id}`} className={buttonVariants({ variant: "outline" })}>
            Back to candidate
          </Link>
        }
      />
    </CandidateAccess>
  );
}
