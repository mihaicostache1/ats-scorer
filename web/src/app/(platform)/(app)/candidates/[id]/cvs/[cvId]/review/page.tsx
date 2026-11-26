import { CvReview, CvReviewAccess } from "@/components/cv-review/cv-review";

/**
 * F-11: the original PDF next to the parsed fields, which can be corrected and saved. Every role may
 * open it; roles that can't edit candidates see it read-only.
 */
export default async function CvReviewPage({
  params,
}: PageProps<"/candidates/[id]/cvs/[cvId]/review">) {
  const { id, cvId } = await params;
  return (
    <CvReviewAccess>
      <CvReview candidateId={id} cvId={cvId} />
    </CvReviewAccess>
  );
}
