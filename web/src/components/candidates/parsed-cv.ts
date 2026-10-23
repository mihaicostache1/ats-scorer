/**
 * Reads `candidate.parsed_data` for display. The API types it as an open object, and what is in it
 * depends on the parser version, so everything here is defensive: unknown shapes are skipped, never
 * thrown on. Understands parsed-CV schema 1.0 (docs/ml/parsed-cv-schema.md) and the older draft
 * shape (`skills: string[]`, `work_history`) still found in some data.
 */

export interface ParsedSummary {
  headline: string | null;
  summary: string | null;
  experienceYears: number | null;
  skills: string[];
  experiences: { title: string; company: string | null; period: string | null }[];
  education: { degree: string; institution: string | null; gradYear: number | null }[];
  languages: { language: string; level: string | null }[];
  certifications: string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-05" → "May 2022"; anything else is shown as given. */
function formatYearMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : value;
}

function period(e: Obj): string | null {
  const start = str(e.start);
  const end = str(e.end);
  if (start) return `${formatYearMonth(start)} – ${end ? formatYearMonth(end) : "Present"}`;
  // Draft shape: a bare number of years.
  const years = num(e.years);
  return years !== null ? `${years} ${years === 1 ? "year" : "years"}` : null;
}

/** Returns what could be read, or `null` when `parsed_data` is empty or has nothing displayable. */
export function readParsedSummary(data: unknown): ParsedSummary | null {
  if (!isObj(data)) return null;

  const skills = list(data.skills)
    .map((s) => (isObj(s) ? str(s.raw) : str(s)))
    .filter((s): s is string => s !== null);

  // `experiences` (1.0) or `work_history` (draft).
  const experiences = [...list(data.experiences), ...list(data.work_history)].flatMap((e) => {
    if (!isObj(e)) return [];
    const title = str(e.title);
    return title ? [{ title, company: str(e.company), period: period(e) }] : [];
  });

  const education = list(data.education).flatMap((e) => {
    if (typeof e === "string")
      return str(e) ? [{ degree: e.trim(), institution: null, gradYear: null }] : [];
    if (!isObj(e)) return [];
    const degree = str(e.degree);
    return degree ? [{ degree, institution: str(e.institution), gradYear: num(e.grad_year) }] : [];
  });

  const languages = list(data.languages).flatMap((l) => {
    if (!isObj(l)) return [];
    const language = str(l.language);
    return language ? [{ language, level: str(l.level) }] : [];
  });

  const summary: ParsedSummary = {
    headline: str(data.headline),
    summary: str(data.summary),
    experienceYears: num(data.experience_years),
    skills,
    experiences,
    education,
    languages,
    certifications: list(data.certifications)
      .map(str)
      .filter((c): c is string => c !== null),
  };

  const hasContent =
    summary.headline ||
    summary.summary ||
    summary.experienceYears !== null ||
    skills.length ||
    experiences.length ||
    education.length ||
    languages.length ||
    summary.certifications.length;
  return hasContent ? summary : null;
}
