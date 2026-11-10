import { z } from "zod";
import type { components } from "@/api/generated/schema";

/**
 * Parsed-CV schema 1.0 (L-10) on the client, plus the mapping between a profile and the review form.
 *
 * `parsedCvSchema` mirrors `ml/ats_scoring/schemas/parsed_cv.schema.json` and is checked against its
 * valid and invalid fixtures in `parsed-cv-schema.test.ts`. A save only goes out when the profile it
 * would produce passes it, so nothing the API would reject as malformed L-10 is ever sent.
 */

export type ParsedCV = components["schemas"]["ParsedCV"];
export type ParsedProfilePatch = components["schemas"]["ParsedProfilePatch"];
type ParsedCvExperience = components["schemas"]["ParsedCvExperience"];
type ParsedCvSkill = components["schemas"]["ParsedCvSkill"];
type ParsedCvEducation = components["schemas"]["ParsedCvEducation"];
type ParsedCvLanguage = components["schemas"]["ParsedCvLanguage"];

// ─── L-10, as the JSON Schema states it ───────────────────────────────────────

const YEAR_MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const POINTER = /^(\/[A-Za-z0-9_-]+)+$/;

const yearMonth = z.string().regex(YEAR_MONTH);
const nullableText = z.string().nullable().optional();

export const parsedCvSchema = z.strictObject({
  schema_version: z.literal("1.0"),
  source: z.enum(["parser", "recruiter"]),
  contact: z
    .strictObject({
      name: nullableText,
      email: nullableText,
      phone: nullableText,
      location: nullableText,
      links: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  headline: nullableText,
  summary: nullableText,
  skills: z.array(
    z.strictObject({
      raw: z.string().min(1),
      // The key must be present; `null` means "not recognized".
      normalized: z.string().min(1).nullable(),
    })
  ),
  experience_years: z.number().min(0).nullable().optional(),
  experiences: z
    .array(
      z.strictObject({
        title: z.string().min(1),
        company: nullableText,
        start: yearMonth.nullable().optional(),
        end: yearMonth.nullable().optional(),
        is_current: z.boolean().optional(),
        summary: nullableText,
        bullets: z.array(z.string()).optional(),
      })
    )
    .optional(),
  education: z
    .array(
      z.strictObject({
        degree: z.string().min(1),
        institution: nullableText,
        grad_year: z.number().int().min(1950).max(2100).nullable().optional(),
      })
    )
    .optional(),
  languages: z
    .array(z.strictObject({ language: z.string().min(1), level: nullableText }))
    .optional(),
  certifications: z.array(z.string().min(1)).optional(),
  confidence: z.record(z.string().regex(POINTER), z.number().min(0).max(1)).optional(),
});

// ─── Form values ──────────────────────────────────────────────────────────────

/**
 * Rows of a list carry the index they had in the saved profile (`originIndex`, `null` for rows added
 * in the form). Confidence pointers refer to saved indexes, so this is what keeps a highlight on the
 * right row after other rows were added or removed.
 */
type Row<T> = T & { originIndex: number | null };

export interface ReviewFormValues {
  contact: { name: string; email: string; phone: string; location: string; links: string[] };
  headline: string;
  summary: string;
  /** Text, so an empty box stays empty. */
  experience_years: string;
  skills: Row<{ raw: string; normalized: string }>[];
  experiences: Row<{
    title: string;
    company: string;
    start: string;
    end: string;
    is_current: boolean;
    summary: string;
    /** One bullet per line. */
    bullets: string;
  }>[];
  education: Row<{ degree: string; institution: string; grad_year: string }>[];
  languages: Row<{ language: string; level: string }>[];
  certifications: string[];
}

const text = (value: string | null | undefined) => value ?? "";

const skillRow = (s: ParsedCvSkill, originIndex: number | null): ReviewFormValues["skills"][0] => ({
  raw: s.raw,
  normalized: text(s.normalized),
  originIndex,
});

const experienceRow = (
  e: ParsedCvExperience,
  originIndex: number | null
): ReviewFormValues["experiences"][0] => ({
  title: e.title,
  company: text(e.company),
  start: text(e.start),
  end: text(e.end),
  is_current: e.is_current ?? false,
  summary: text(e.summary),
  bullets: (e.bullets ?? []).join("\n"),
  originIndex,
});

const educationRow = (
  e: ParsedCvEducation,
  originIndex: number | null
): ReviewFormValues["education"][0] => ({
  degree: e.degree,
  institution: text(e.institution),
  grad_year: e.grad_year == null ? "" : String(e.grad_year),
  originIndex,
});

const languageRow = (
  l: ParsedCvLanguage,
  originIndex: number | null
): ReviewFormValues["languages"][0] => ({
  language: l.language,
  level: text(l.level),
  originIndex,
});

export const blankSkill = (): ReviewFormValues["skills"][0] =>
  skillRow({ raw: "", normalized: null }, null);
export const blankExperience = (): ReviewFormValues["experiences"][0] =>
  experienceRow({ title: "" }, null);
export const blankEducation = (): ReviewFormValues["education"][0] =>
  educationRow({ degree: "" }, null);
export const blankLanguage = (): ReviewFormValues["languages"][0] =>
  languageRow({ language: "" }, null);

export function toFormValues(parsed: ParsedCV): ReviewFormValues {
  return {
    contact: {
      name: text(parsed.contact?.name),
      email: text(parsed.contact?.email),
      phone: text(parsed.contact?.phone),
      location: text(parsed.contact?.location),
      links: parsed.contact?.links ?? [],
    },
    headline: text(parsed.headline),
    summary: text(parsed.summary),
    experience_years: parsed.experience_years == null ? "" : String(parsed.experience_years),
    skills: parsed.skills.map((s, i) => skillRow(s, i)),
    experiences: (parsed.experiences ?? []).map((e, i) => experienceRow(e, i)),
    education: (parsed.education ?? []).map((e, i) => educationRow(e, i)),
    languages: (parsed.languages ?? []).map((l, i) => languageRow(l, i)),
    certifications: parsed.certifications ?? [],
  };
}

// ─── Validation of the form ───────────────────────────────────────────────────

/** The `candidates` columns the contact fields are copied into have tighter limits than L-10. */
const CONTACT_LIMITS = { name: 255, email: 255, phone: 50, location: 255 } as const;

const isEmail = (value: string) => z.email().safeParse(value).success;

const rowText = (max?: number) => {
  const base = z.string();
  return max ? base.max(max, `At most ${max} characters`) : base;
};

const fieldMessage = {
  required: (what: string) => `Enter ${what}`,
};

/**
 * Field-level rules for the form. Rules that depend on what was saved before (a contact name or email
 * that was found can't be cleared; contact details are only checked against the stricter canonical
 * rules when they changed, because a parser value that was never touched is not sent) live in
 * `reviewFormSchema`.
 */
const formShape = z.object({
  contact: z.object({
    // Length limits are checked in `reviewFormSchema`, and only for values that changed.
    name: rowText(),
    email: rowText(),
    phone: rowText(),
    location: rowText(),
    links: z.array(z.string().trim().min(1)),
  }),
  headline: rowText(),
  summary: rowText(),
  experience_years: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v))), {
      message: "Enter a number of years, 0 or more",
    }),
  skills: z.array(
    z.object({
      raw: z.string().trim().min(1, fieldMessage.required("the skill as written in the CV")),
      normalized: rowText(),
      originIndex: z.number().nullable(),
    })
  ),
  experiences: z.array(
    z.object({
      title: z.string().trim().min(1, fieldMessage.required("a job title")),
      company: rowText(),
      start: z
        .string()
        .trim()
        .refine((v) => v === "" || YEAR_MONTH.test(v), { message: "Use YYYY-MM, e.g. 2022-05" }),
      end: z
        .string()
        .trim()
        .refine((v) => v === "" || YEAR_MONTH.test(v), { message: "Use YYYY-MM, e.g. 2022-05" }),
      is_current: z.boolean(),
      summary: rowText(),
      bullets: rowText(),
      originIndex: z.number().nullable(),
    })
  ),
  education: z.array(
    z.object({
      degree: z.string().trim().min(1, fieldMessage.required("a degree")),
      institution: rowText(),
      grad_year: z
        .string()
        .trim()
        .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1950 && Number(v) <= 2100), {
          message: "Enter a year from 1950 to 2100",
        }),
      originIndex: z.number().nullable(),
    })
  ),
  languages: z.array(
    z.object({
      language: z.string().trim().min(1, fieldMessage.required("a language")),
      level: rowText(),
      originIndex: z.number().nullable(),
    })
  ),
  certifications: z.array(z.string().trim().min(1)),
});

/**
 * The resolver schema for the form, bound to the profile it edits. Pass `original` so contact checks
 * know what was saved.
 */
export function reviewFormSchema(original: ParsedCV) {
  const saved = toFormValues(original).contact;
  return formShape.superRefine((values, ctx) => {
    const changed = (key: "name" | "email" | "phone" | "location") =>
      values.contact[key].trim() !== saved[key].trim();

    // B-14 refuses to clear a contact name or email that was found, or to set an invalid email.
    if (changed("name") && values.contact.name.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["contact", "name"],
        message: "The name can't be cleared. Correct it instead.",
      });
    }
    if (changed("email")) {
      const email = values.contact.email.trim();
      if (email === "") {
        ctx.addIssue({
          code: "custom",
          path: ["contact", "email"],
          message: "The email can't be cleared. Correct it instead.",
        });
      } else if (!isEmail(email)) {
        ctx.addIssue({
          code: "custom",
          path: ["contact", "email"],
          message: "Enter a valid email address",
        });
      }
    }
    // The canonical columns' length limits only matter for what is sent.
    for (const key of ["name", "email", "phone", "location"] as const) {
      if (changed(key) && values.contact[key].trim().length > CONTACT_LIMITS[key]) {
        ctx.addIssue({
          code: "custom",
          path: ["contact", key],
          message: `At most ${CONTACT_LIMITS[key]} characters`,
        });
      }
    }
  });
}

// ─── Form → patch ─────────────────────────────────────────────────────────────

const clean = (v: string) => v.trim();
const orNull = (v: string) => clean(v) || null;

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** `rows` as the profile stores them, reusing the saved object for rows nobody edited. */
function buildRows<F extends { originIndex: number | null }, S>(
  rows: F[],
  saved: S[],
  toSaved: (row: F) => S,
  toRow: (item: S, originIndex: number) => F,
  same: (a: F, b: F) => boolean
): S[] {
  return rows.map((row) => {
    const original = row.originIndex === null ? undefined : saved[row.originIndex];
    if (original !== undefined && same(row, toRow(original, row.originIndex as number))) {
      return original;
    }
    return toSaved(row);
  });
}

const sameFields = <T extends object>(a: T, b: T) =>
  (Object.keys(a) as (keyof T)[]).every((key) =>
    typeof a[key] === "string"
      ? clean(a[key] as string) === clean(b[key] as string)
      : a[key] === b[key]
  );

const bulletsOf = (value: string) =>
  value
    .split("\n")
    .map(clean)
    .filter((line) => line !== "");

/**
 * Only what the recruiter changed, in the shape of `PATCH /candidates/{id}/parsed-profile` (B-14):
 * nested objects merge and lists replace, so a changed list goes out whole and an unchanged one is
 * left out. `source` and `confidence` are never sent; the server sets them.
 */
export function toPatch(values: ReviewFormValues, original: ParsedCV): ParsedProfilePatch {
  const before = toFormValues(original);
  const patch: ParsedProfilePatch = {};

  const contact: NonNullable<ParsedProfilePatch["contact"]> = {};
  if (clean(values.contact.name) !== clean(before.contact.name)) {
    contact.name = clean(values.contact.name);
  }
  if (clean(values.contact.email) !== clean(before.contact.email)) {
    contact.email = clean(values.contact.email);
  }
  if (clean(values.contact.phone) !== clean(before.contact.phone)) {
    contact.phone = orNull(values.contact.phone);
  }
  if (clean(values.contact.location) !== clean(before.contact.location)) {
    contact.location = orNull(values.contact.location);
  }
  if (!deepEqual(values.contact.links.map(clean), before.contact.links.map(clean))) {
    contact.links = values.contact.links.map(clean);
  }
  if (Object.keys(contact).length) patch.contact = contact;

  if (clean(values.headline) !== clean(before.headline)) patch.headline = orNull(values.headline);
  if (clean(values.summary) !== clean(before.summary)) patch.summary = orNull(values.summary);
  if (clean(values.experience_years) !== clean(before.experience_years)) {
    patch.experience_years = clean(values.experience_years)
      ? Number(clean(values.experience_years))
      : null;
  }

  const skills = buildRows(
    values.skills,
    original.skills,
    (r): ParsedCvSkill => ({ raw: clean(r.raw), normalized: orNull(r.normalized) }),
    skillRow,
    sameFields
  );
  if (!deepEqual(skills, original.skills)) patch.skills = skills;

  const experiences = buildRows(
    values.experiences,
    original.experiences ?? [],
    (r): ParsedCvExperience => ({
      title: clean(r.title),
      company: orNull(r.company),
      start: orNull(r.start),
      end: orNull(r.end),
      is_current: r.is_current,
      summary: orNull(r.summary),
      bullets: bulletsOf(r.bullets),
    }),
    experienceRow,
    sameFields
  );
  if (!deepEqual(experiences, original.experiences ?? [])) patch.experiences = experiences;

  const education = buildRows(
    values.education,
    original.education ?? [],
    (r): ParsedCvEducation => ({
      degree: clean(r.degree),
      institution: orNull(r.institution),
      grad_year: clean(r.grad_year) ? Number(clean(r.grad_year)) : null,
    }),
    educationRow,
    sameFields
  );
  if (!deepEqual(education, original.education ?? [])) patch.education = education;

  const languages = buildRows(
    values.languages,
    original.languages ?? [],
    (r): ParsedCvLanguage => ({ language: clean(r.language), level: orNull(r.level) }),
    languageRow,
    sameFields
  );
  if (!deepEqual(languages, original.languages ?? [])) patch.languages = languages;

  const certifications = values.certifications.map(clean);
  if (!deepEqual(certifications, original.certifications ?? [])) {
    patch.certifications = certifications;
  }

  return patch;
}

/** The server's merge (B-14): nested objects merge, everything else, lists included, is replaced. */
export function mergeForValidation(original: ParsedCV, patch: ParsedProfilePatch): unknown {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  const merge = (base: Record<string, unknown>, change: Record<string, unknown>) => {
    const result: Record<string, unknown> = structuredClone(base);
    for (const [key, value] of Object.entries(change)) {
      const current = result[key];
      result[key] =
        isObject(value) && isObject(current) ? merge(current, value) : structuredClone(value);
    }
    return result;
  };
  return merge(original as Record<string, unknown>, patch as Record<string, unknown>);
}

export type PatchCheck =
  | { ok: true; patch: ParsedProfilePatch }
  | { ok: false; issues: { path: string; message: string }[] };

/**
 * Builds the patch and checks that the profile the server would store is valid L-10. This is the last
 * gate before a request: when it fails nothing is sent.
 */
export function checkPatch(values: ReviewFormValues, original: ParsedCV): PatchCheck {
  const patch = toPatch(values, original);
  const merged = parsedCvSchema.safeParse(mergeForValidation(original, patch));
  if (merged.success) return { ok: true, patch };
  return {
    ok: false,
    issues: merged.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}
