import { isRating, pairKey, type Pair, type Rating } from "./types";

/**
 * The export, in the format L-9 reads (`load_ratings` in `ml/ats_scoring/evaluate.py`): a copy of
 * `ml/evaluation/pairs.csv` with the `rating` column filled in. That means the same header, every
 * pair in the same order and no extra rows, so the file can be dropped into `ml/evaluation/ratings/`
 * as it is. A pair without a rating keeps an empty cell, which L-9 ignores. Lines end in CRLF like
 * `pairs.csv` (Python's `csv` module does the same), and the file has no byte order mark.
 */

export const CSV_HEADER = "candidate_id,job_id,rating";

export function exportRatingsCsv(
  pairs: readonly Pair[],
  ratings: Readonly<Record<string, Rating>>
): string {
  const rows = pairs.map((pair) => {
    const rating = ratings[pairKey(pair)];
    return `${pair.candidateId},${pair.jobId},${rating === undefined ? "" : rating}`;
  });
  return [CSV_HEADER, ...rows].map((line) => `${line}\r\n`).join("");
}

/**
 * Ratings saved for another version of the evaluation set, written out as they are so nothing is lost
 * when the rater chooses to start over. Only valid ratings, sorted by pair. It may name pairs the
 * current `ml/evaluation/data/` does not have, so L-9 may refuse it: it is a rescue copy, not a rating file.
 */
export function exportLooseRatingsCsv(ratings: Readonly<Record<string, unknown>>): string {
  const rows = Object.entries(ratings)
    .filter(([key, value]) => /^[^,|\r\n]+\|[^,|\r\n]+$/.test(key) && isRating(value))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key.replace("|", ",")},${value}`);
  return [CSV_HEADER, ...rows].map((line) => `${line}\r\n`).join("");
}

/**
 * The rater name as a file name. L-9 uses the file name without `.csv` as the rater's name, so it is
 * kept to lowercase letters, digits, `-` and `_`. Returns "" when nothing usable is left.
 */
export function raterSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 40);
}

/** `ratings/<rater>.csv`: the name the file should have when it is saved into `ml/evaluation/`. */
export const csvFileName = (slug: string): string => `${slug}.csv`;
