import { Badge } from "@/components/ui/badge";
import type { JobRecord } from "../_lib/types";

const formatEmploymentType = (type: string) => type.replace(/_/g, " ");

function Skills({ label, skills }: { label: string; skills: string[] }) {
  if (skills.length === 0) return null;
  return (
    <div>
      <h3 className="text-muted-foreground text-footnote font-medium">{label}</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li key={skill}>
            <Badge variant="secondary">{skill}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The job a CV is rated against, as the recruiter would read it. */
export function JobCard({ job }: { job: JobRecord }) {
  const facts = [
    job.location,
    formatEmploymentType(job.employment_type),
    `${job.min_experience_years} ${job.min_experience_years === 1 ? "year" : "years"} minimum`,
  ].filter(Boolean);

  return (
    <article aria-labelledby="labeling-job-title" className="glass space-y-4 rounded-2xl p-5">
      <header>
        <p className="text-muted-foreground text-footnote font-medium">Job {job.id}</p>
        <h2 id="labeling-job-title" className="text-foreground text-title-3">
          {job.title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{facts.join(" · ")}</p>
      </header>
      <Skills label="Required skills" skills={job.required_skills} />
      <Skills label="Nice to have" skills={job.preferred_skills} />
      <div>
        <h3 className="text-muted-foreground text-footnote font-medium">Description</h3>
        <p className="text-foreground mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
          {job.description}
        </p>
      </div>
    </article>
  );
}
