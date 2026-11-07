import type { ParsedCV } from "./parsed-cv-schema";

/**
 * Where the review screen starts calling a parsed value doubtful. The schema fixes no threshold
 * (docs/ml/parsed-cv-schema.md); this is the backend's default `CV_REVIEW_CONFIDENCE_THRESHOLD`, so
 * what is highlighted here is what moved the CV to "needs review".
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export type ConfidenceMap = Record<string, number>;

/** `pointerFor("skills", 3, "normalized")` → `/skills/3/normalized`. */
export const pointerFor = (...parts: (string | number)[]): string => `/${parts.join("/")}`;

/**
 * `/experiences/0/start` → [`/experiences/0/start`, `/experiences/0`]. The pointer itself and its row
 * count; a whole section (`/experiences`, `/contact`) does not, so one doubtful section is flagged
 * once on the section (see `sectionConfidence`) instead of on every field in it.
 */
function selfAndRow(pointer: string): string[] {
  const parts = pointer.split("/").slice(1);
  return parts
    .map((_, i) => parts.slice(0, parts.length - i))
    .filter((p, i) => i === 0 || p.length >= 2)
    .map((p) => `/${p.join("/")}`);
}

/**
 * The lowest confidence that applies to a field, or `null` when there is none. A value recorded for
 * a field's row (`/experiences/0`) applies to the whole row. A field with no entry has no confidence
 * value, which is not the same as a low one.
 */
export function confidenceFor(
  confidence: ConfidenceMap | undefined,
  pointer: string
): number | null {
  if (!confidence) return null;
  const values = selfAndRow(pointer)
    .map((p) => confidence[p])
    .filter((v): v is number => typeof v === "number");
  return values.length ? Math.min(...values) : null;
}

/** A value the parser recorded for a whole section, such as `/experiences`, if it is low. */
export function lowSectionConfidence(
  confidence: ConfidenceMap | undefined,
  section: string
): number | null {
  const value = confidence?.[`/${section}`];
  return typeof value === "number" && value < LOW_CONFIDENCE_THRESHOLD ? value : null;
}

/** The confidence to warn about, or `null` when the field is fine or has no value. */
export function lowConfidenceFor(
  confidence: ConfidenceMap | undefined,
  pointer: string
): number | null {
  const value = confidenceFor(confidence, pointer);
  return value !== null && value < LOW_CONFIDENCE_THRESHOLD ? value : null;
}

export const formatConfidence = (value: number) => `${Math.round(value * 100)}%`;

const SECTION_LABELS: Record<string, string> = {
  contact: "Contact",
  headline: "Headline",
  summary: "Summary",
  skills: "Skill",
  experience_years: "Years of experience",
  experiences: "Experience",
  education: "Education",
  languages: "Language",
  certifications: "Certification",
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  location: "location",
  links: "links",
  raw: "as written",
  normalized: "standard name",
  title: "title",
  company: "company",
  start: "start date",
  end: "end date",
  is_current: "current job",
  summary: "summary",
  bullets: "bullets",
  degree: "degree",
  institution: "institution",
  grad_year: "graduation year",
  language: "language",
  level: "level",
};

const LISTS = new Set(["skills", "experiences", "education", "languages", "certifications"]);

/** A person-readable name for a pointer: `/skills/3/normalized` → "Skill 4 · standard name". */
export function describePointer(pointer: string): string {
  const [section, second, third] = pointer.split("/").slice(1);
  const base = SECTION_LABELS[section] ?? section;
  if (LISTS.has(section)) {
    if (second === undefined) return `${base}${base.endsWith("s") ? "" : "s"}`;
    const row = /^\d+$/.test(second) ? `${base} ${Number(second) + 1}` : base;
    return third ? `${row} · ${FIELD_LABELS[third] ?? third}` : row;
  }
  if (section === "contact" && second) return `Contact · ${FIELD_LABELS[second] ?? second}`;
  return base;
}

export interface LowConfidenceField {
  pointer: string;
  confidence: number;
  label: string;
}

/** Everything below the threshold, lowest first. */
export function lowConfidenceFields(parsed: Pick<ParsedCV, "confidence">): LowConfidenceField[] {
  return Object.entries(parsed.confidence ?? {})
    .filter(([, value]) => value < LOW_CONFIDENCE_THRESHOLD)
    .map(([pointer, confidence]) => ({ pointer, confidence, label: describePointer(pointer) }))
    .sort((a, b) => a.confidence - b.confidence || a.pointer.localeCompare(b.pointer));
}
