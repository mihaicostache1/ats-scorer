"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

import { createJob, updateJob } from "@/api";
import { EmptyState } from "@/components/common/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";
import { EMPLOYMENT_TYPES, formatEmploymentType } from "./job-meta";
import {
  emptyJobForm,
  JOB_FORM_FIELDS,
  jobFormSchema,
  jobToFormValues,
  toCreateRequest,
  toUpdateRequest,
  type JobFormValues,
} from "./job-schema";
import type { JobResponse } from "./use-jobs";

/**
 * Create (no `job`) or edit (`job`) form. Validation problems show next to their field; anything
 * the server rejects is reported as a toast, and field-level server errors are also marked inline.
 */
export function JobForm({ job }: { job?: JobResponse }) {
  const router = useRouter();
  const { can } = useSession();
  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: job ? jobToFormValues(job) : emptyJobForm,
  });
  const { errors, isSubmitting } = form.formState;

  const backHref = job ? `/jobs/${job.id}` : "/jobs";

  if (!can("job:write")) {
    return (
      <EmptyState
        icon={Lock}
        title="You can't edit jobs"
        description="Your role is read-only. Ask an admin or recruiter to create or change job postings."
        action={
          <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
            Back to jobs
          </Link>
        }
      />
    );
  }

  const reportFailure = (error: unknown, status: number) => {
    const failure = parseApiFailure(error, status);
    for (const [name, message] of Object.entries(failure.fields)) {
      if ((JOB_FORM_FIELDS as string[]).includes(name)) {
        form.setError(name as keyof JobFormValues, { type: "server", message });
      }
    }
    toast.error(failure.message, job ? "Couldn't save job" : "Couldn't create job");
  };

  const onSubmit = async (values: JobFormValues) => {
    try {
      if (job) {
        const body = toUpdateRequest(values, job);
        if (Object.keys(body).length === 0) {
          toast.info("There were no changes to save.");
          router.push(backHref);
          return;
        }
        const { data, error, response } = await updateJob(job.id, body);
        if (!data) return reportFailure(error, response.status);
        toast.success(`“${data.title}” was updated.`, "Job saved");
        router.push(`/jobs/${data.id}`);
      } else {
        const { data, error, response } = await createJob(toCreateRequest(values));
        if (!data) return reportFailure(error, response.status);
        toast.success(`“${data.title}” was created as a draft.`, "Job created");
        router.push(`/jobs/${data.id}`);
      }
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE, job ? "Couldn't save job" : "Couldn't create job");
    }
  };

  // An existing job may use a type the form doesn't list; keep it selectable.
  const employmentTypes: string[] = [...EMPLOYMENT_TYPES];
  if (job && !employmentTypes.includes(job.employment_type)) {
    employmentTypes.push(job.employment_type);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {job ? "Back to job" : "Back to jobs"}
        </Link>
        <h1 className="text-foreground mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          {job ? "Edit job" : "New job"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {job
            ? "Changing the requirements refreshes candidate scores."
            : "New jobs start as drafts."}
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="border-border bg-card space-y-5 rounded-xl border p-6 shadow-xs"
          noValidate
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Senior Backend Engineer"
                    autoComplete="off"
                    error={!!errors.title}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Input placeholder="Engineering" error={!!errors.department} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Remote, Bucharest…" error={!!errors.location} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="employment_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment type</FormLabel>
                  <FormControl>
                    <Select error={!!errors.employment_type} {...field}>
                      {employmentTypes.map((type) => (
                        <option key={type} value={type}>
                          {formatEmploymentType(type)}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="min_experience_years"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum experience (years)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      error={!!errors.min_experience_years}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    rows={8}
                    placeholder="What will this person do? What does the team look like?"
                    error={!!errors.description}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="required_skills"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Required skills</FormLabel>
                <FormControl>
                  <TagsInput
                    placeholder="Type a skill and press Enter"
                    error={!!errors.required_skills}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Press Enter or comma to add a skill. Backspace removes the last one.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="preferred_skills"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nice-to-have skills</FormLabel>
                <FormControl>
                  <TagsInput
                    placeholder="Type a skill and press Enter"
                    error={!!errors.preferred_skills}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
              Cancel
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? "Saving…" : job ? "Save changes" : "Create job"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
