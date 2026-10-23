import { describe, expect, it } from "vitest";
import { mockJobs } from "@/mocks/fixtures/jobs";
import {
  emptyJobForm,
  jobFormSchema,
  jobToFormValues,
  toCreateRequest,
  toUpdateRequest,
} from "./job-schema";

const job = mockJobs[0];
const valid = { ...emptyJobForm, title: "Engineer", description: "Build things" };

describe("jobFormSchema", () => {
  it("accepts a minimal job", () => {
    expect(jobFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a title and a description", () => {
    const result = jobFormSchema.safeParse({ ...valid, title: "  ", description: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toEqual(expect.arrayContaining(["title", "description"]));
    }
  });

  it("rejects experience that is not a whole number", () => {
    expect(jobFormSchema.safeParse({ ...valid, min_experience_years: "2.5" }).success).toBe(false);
    expect(jobFormSchema.safeParse({ ...valid, min_experience_years: "-1" }).success).toBe(false);
    expect(jobFormSchema.safeParse({ ...valid, min_experience_years: "5" }).success).toBe(true);
  });
});

describe("toCreateRequest", () => {
  it("omits empty optional text and defaults experience to 0", () => {
    const body = toCreateRequest(valid);
    expect(body.department).toBeUndefined();
    expect(body.location).toBeUndefined();
    expect(body.min_experience_years).toBe(0);
  });
});

describe("toUpdateRequest", () => {
  it("sends nothing when nothing changed", () => {
    expect(toUpdateRequest(jobToFormValues(job), job)).toEqual({});
  });

  it("sends only the changed fields", () => {
    const values = { ...jobToFormValues(job), title: "New title" };
    expect(toUpdateRequest(values, job)).toEqual({ title: "New title" });
  });

  it("sends null for a cleared department or location, never for other fields", () => {
    const values = { ...jobToFormValues(job), department: "", location: "" };
    const body = toUpdateRequest(values, { ...job, department: "Eng", location: "Remote" });
    expect(body).toEqual({ department: null, location: null });
  });

  it("detects changed skill lists", () => {
    const values = { ...jobToFormValues(job), required_skills: [...job.required_skills, "Zig"] };
    expect(toUpdateRequest(values, job)).toEqual({ required_skills: values.required_skills });
  });
});
