/** Mock equivalent of the API's review-only duplicate suggestions. */
import type { components } from "@/api/generated/schema";

type Candidate = components["schemas"]["CandidateResponse"];
type Match = components["schemas"]["PossibleDuplicate"];

const email = (value: string) => value.trim().toLowerCase();
const phone = (value: string) => {
  if (!/^[+0-9().\s/\-]+$/.test(value)) return "";
  const digits = value.replace(/[^0-9]/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
};
const name = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, " ")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");

function identity(candidate: Candidate) {
  const raw = candidate.parsed_data.contact;
  const contact = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values = (a: unknown, b: unknown, normalize: (v: string) => string) =>
    [a, b]
      .filter((v): v is string => typeof v === "string")
      .map(normalize)
      .filter(Boolean);
  return {
    emails: values(candidate.email, contact.email, email),
    phones: values(candidate.phone, contact.phone, phone),
    names: values(candidate.full_name, contact.name, name).filter((v) => v.length >= 3),
  };
}

/** RapidFuzz ratio is the normalized insertion/deletion similarity (LCS). */
function ratio(a: string, b: string): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    let previous = 0;
    for (let j = 0; j < b.length; j++) {
      const saved = row[j + 1];
      row[j + 1] = a[i] === b[j] ? previous + 1 : Math.max(row[j], row[j + 1]);
      previous = saved;
    }
  }
  return (200 * row[b.length]) / (a.length + b.length);
}

export function possibleDuplicates(candidate: Candidate, pool: Candidate[]): Match[] {
  const subject = identity(candidate);
  const matches: Match[] = [];
  for (const other of pool) {
    if (candidate.id === other.id || candidate.org_id !== other.org_id) continue;
    const target = identity(other);
    const matched: Match["matched_on"] = [];
    if (subject.emails.some((v) => target.emails.includes(v))) matched.push("email");
    if (subject.phones.some((v) => target.phones.includes(v))) matched.push("phone");
    const similarity = Math.max(
      0,
      ...subject.names.flatMap((a) => target.names.map((b) => ratio(a, b)))
    );
    if (similarity >= 85) matched.push("name");
    if (matched.length) {
      matches.push({
        candidate_id: other.id,
        full_name: other.full_name,
        matched_on: matched,
        name_similarity: similarity >= 85 ? Math.round(similarity * 100) / 100 : null,
      });
    }
  }
  return matches.sort(
    (a, b) =>
      Number(b.matched_on.includes("email")) - Number(a.matched_on.includes("email")) ||
      Number(b.matched_on.includes("phone")) - Number(a.matched_on.includes("phone")) ||
      (b.name_similarity ?? 0) - (a.name_similarity ?? 0) ||
      a.candidate_id.localeCompare(b.candidate_id)
  );
}
