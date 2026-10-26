import { JobDetail } from "@/components/jobs/job-detail";

export default async function JobDetailPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  return <JobDetail id={id} />;
}
