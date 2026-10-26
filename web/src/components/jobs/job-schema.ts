import { z } from "zod";
import type { components } from "@/api/generated/schema";
import type { JobResponse } from "./use-jobs";

type CreateJobRequest = components["schemas"]["CreateJobRequest"];
type UpdateJobRequest = components["schemas"]["UpdateJobRequest"];

const skill = z.string().trim().min(1).max(100, "Each skill can be at most 100 characters");

/** Limits mirror the API's own validation (api/app/schemas/job.py). */
export const jobFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a job title")
    .max(255, "Title can be at most 255 characters"),
  department: z.string().trim().max(100, "Department can be at most 100 characters"),
  location: z.string().trim().max(100, "Location can be at most 100 characters"),
  employment_type: z.string().trim().min(1, "Choose an employment type").max(50),
  // Kept as text so an empty box stays empty; converted by the mappers below.
  min_experience_years: z
    .string()
    .trim()
    .regex(/^\d{0,2}$/, "Enter a whole number from 0 to 99"),
  description: z.string().trim().min(1, "Enter a job description"),
  required_skills: z.array(skill).max(50, "At most 50 skills"),
  preferred_skills: z.array(skill).max(50, "At most 50 skills"),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const JOB_FORM_FIELDS = Object.keys(jobFormSchema.shape) as (keyof JobFormValues)[];

export const emptyJobForm: JobFormValues = {
  title: "",
  department: "",
  location: "",
  employment_type: "full_time",
  min_experience_years: "",
  description: "",
  required_skills: [],
  preferred_skills: [],
};

export function jobToFormValues(job: JobResponse): JobFormValues {
  return {
    title: job.title,
    department: job.department ?? "",
    location: job.location ?? "",
    employment_type: job.employment_type,
    min_experience_years: job.min_experience_years ? String(job.min_experience_years) : "",
    description: job.description,
    required_skills: job.required_skills,
    preferred_skills: job.preferred_skills,
  };
}

export function toCreateRequest(values: JobFormValues): CreateJobRequest {
  return {
    title: values.title,
    description: values.description,
    department: values.department || undefined,
    location: values.location || undefined,
    employment_type: values.employment_type,
    min_experience_years: values.min_experience_years ? Number(values.min_experience_years) : 0,
    required_skills: values.required_skills,
    preferred_skills: values.preferred_skills,
  };
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Only the fields that changed. `department` and `location` become `null` when cleared (the API
 * accepts null for those two only); every other field is always sent as a value.
 */
export function toUpdateRequest(values: JobFormValues, job: JobResponse): UpdateJobRequest {
  const body: UpdateJobRequest = {};
  if (values.title !== job.title) body.title = values.title;
  if (values.description !== job.description) body.description = values.description;
  if (values.department !== (job.department ?? "")) body.department = values.department || null;
  if (values.location !== (job.location ?? "")) body.location = values.location || null;
  if (values.employment_type !== job.employment_type) body.employment_type = values.employment_type;
  const years = values.min_experience_years ? Number(values.min_experience_years) : 0;
  if (years !== job.min_experience_years) body.min_experience_years = years;
  if (!sameList(values.required_skills, job.required_skills)) {
    body.required_skills = values.required_skills;
  }
  if (!sameList(values.preferred_skills, job.preferred_skills)) {
    body.preferred_skills = values.preferred_skills;
  }
  return body;
}
