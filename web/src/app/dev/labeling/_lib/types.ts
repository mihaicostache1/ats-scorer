/** Rating scale from docs/ml/evaluation.md. */
export type Rating = 0 | 1 | 2 | 3;

export const RATINGS: readonly Rating[] = [0, 1, 2, 3];

export const RATING_LABELS: Record<Rating, { name: string; rule: string }> = {
  3: {
    name: "Strong fit",
    rule: "Nearly all required skills and at least the required experience. You would shortlist.",
  },
  2: {
    name: "Good fit",
    rule: "Most required skills. One gap in skills or experience that an interview could clear up.",
  },
  1: {
    name: "Weak fit",
    rule: "Related background, but several required skills are missing or the seniority is clearly wrong.",
  },
  0: {
    name: "No fit",
    rule: "A different field, or almost none of the requirements.",
  },
};

export const isRating = (value: unknown): value is Rating =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;

/** One row of `ml/evaluation/pairs.csv`. */
export interface Pair {
  candidateId: string;
  jobId: string;
}

/** `C001|J01`: how a pair is named in stored progress. */
export const pairKey = (pair: Pair): string => `${pair.candidateId}|${pair.jobId}`;

/** The fields of `ml/evaluation/data/jobs/<id>.json` that a rater reads. */
export interface JobRecord {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  description: string;
  required_skills: string[];
  preferred_skills: string[];
  min_experience_years: number;
}

/** What the server hands the client: the pairs in file order, and the jobs they name. */
export interface LabelingData {
  /** Identifies this version of the evaluation set; saved progress is only valid for the same one. */
  datasetId: string;
  pairs: Pair[];
  jobs: Record<string, JobRecord>;
}
