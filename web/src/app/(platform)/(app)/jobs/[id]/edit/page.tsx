import { JobEdit } from "@/components/jobs/job-edit";

export default async function EditJobPage({ params }: PageProps<"/jobs/[id]/edit">) {
  const { id } = await params;
  return <JobEdit id={id} />;
}
