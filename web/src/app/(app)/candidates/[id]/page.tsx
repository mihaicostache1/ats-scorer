import { CandidateAccess } from "@/components/candidates/candidate-access";
import { CandidateProfile } from "@/components/candidates/candidate-profile";

export default async function CandidateProfilePage({ params }: PageProps<"/candidates/[id]">) {
  const { id } = await params;
  return (
    <CandidateAccess>
      <CandidateProfile id={id} />
    </CandidateAccess>
  );
}
