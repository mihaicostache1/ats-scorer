import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { JobRecord, LabelingData, Pair } from "./types";

/**
 * Server-side loader for the L-9 evaluation set in `ml/evaluation/` (`pairs.csv`, `data/`, `pdfs/`),
 * which `build_eval_set.py` made from the L-5 synthetic dataset. Dev only: it is reached from
 * `page.dev.tsx` and `route.dev.ts`, which are not routes in a production build.
 */

/** `web/` is the working directory of `next dev`, so the evaluation folder is its sibling in `ml/`. */
export const DEFAULT_EVAL_DIR = path.resolve(process.cwd(), "..", "ml", "evaluation");

/** The evaluation set is missing something or is malformed. The message says what to do about it. */
export class LabelingDataError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "LabelingDataError";
  }
}

const CANDIDATE_ID = /^C\d+$/;
const JOB_ID = /^J\d+$/;
const HEADER = "candidate_id,job_id,rating";

/**
 * Reads `pairs.csv`: the exact header, then `candidate_id,job_id,rating` rows. The rating column is a
 * blank template and is ignored. Ids are checked against strict patterns, because they end up in file
 * paths. Order is kept: the file groups the pairs by job, which is how they are meant to be rated.
 */
export function parsePairsCsv(text: string): Pair[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  // One newline after the last row is normal; a blank line anywhere else is reported as a bad row.
  if (lines.at(-1) === "") lines.pop();

  const problems: string[] = [];
  if (lines[0]?.trim() !== HEADER) {
    problems.push(`pairs.csv must start with the header "${HEADER}".`);
  }

  const seen = new Set<string>();
  const pairs: Pair[] = [];
  lines.slice(1).forEach((line, index) => {
    const row = index + 2;
    const cells = line.split(",");
    if (cells.length !== 3) {
      problems.push(`pairs.csv line ${row}: expected 3 columns, found ${cells.length}.`);
      return;
    }
    const candidateId = cells[0].trim();
    const jobId = cells[1].trim();
    if (!CANDIDATE_ID.test(candidateId) || !JOB_ID.test(jobId)) {
      problems.push(
        `pairs.csv line ${row}: "${candidateId},${jobId}" is not a candidate and job id.`
      );
      return;
    }
    const key = `${candidateId}|${jobId}`;
    if (seen.has(key)) {
      problems.push(`pairs.csv line ${row}: ${candidateId}/${jobId} appears twice.`);
      return;
    }
    seen.add(key);
    pairs.push({ candidateId, jobId });
  });

  if (!problems.length && pairs.length === 0) problems.push("pairs.csv has no pairs.");
  if (problems.length) throw new LabelingDataError(problems);
  return pairs;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isNullableString = (value: unknown): value is string | null | undefined =>
  value === null || value === undefined || typeof value === "string";

/** Checks the fields of a job file that the page reads; the file has no id of its own. */
function parseJob(id: string, raw: string): JobRecord {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new LabelingDataError([`data/jobs/${id}.json is not valid JSON.`]);
  }
  const ok =
    typeof data.title === "string" &&
    typeof data.description === "string" &&
    typeof data.employment_type === "string" &&
    typeof data.min_experience_years === "number" &&
    isStringArray(data.required_skills) &&
    isStringArray(data.preferred_skills) &&
    isNullableString(data.department) &&
    isNullableString(data.location);
  if (!ok) throw new LabelingDataError([`data/jobs/${id}.json is missing a field the page needs.`]);
  return {
    id,
    title: data.title as string,
    department: (data.department as string | null | undefined) ?? null,
    location: (data.location as string | null | undefined) ?? null,
    employment_type: data.employment_type as string,
    description: data.description as string,
    required_skills: data.required_skills as string[],
    preferred_skills: data.preferred_skills as string[],
    min_experience_years: data.min_experience_years as number,
  };
}

const exists = (file: string) =>
  stat(file).then(
    (info) => info.isFile(),
    () => false
  );

/** Reads and checks just `pairs.csv`. Cheap enough for the PDF route to call on every request. */
export async function readPairs(evalDir: string = DEFAULT_EVAL_DIR): Promise<Pair[]> {
  let text: string;
  try {
    text = await readFile(path.join(evalDir, "pairs.csv"), "utf8");
  } catch {
    throw new LabelingDataError([
      `Could not read ${path.join(evalDir, "pairs.csv")}. Run the page from web/ with ml/evaluation/ next to it.`,
    ]);
  }
  return parsePairsCsv(text);
}

/**
 * Loads the pairs, their jobs, and checks that every pair is complete the way L-9 needs it: a job
 * file, a candidate file (L-9 rejects ratings for candidates missing from `data/`) and a PDF to read.
 * Everything wrong is reported at once.
 */
export async function loadLabelingData(evalDir: string = DEFAULT_EVAL_DIR): Promise<LabelingData> {
  const pairsText = await readFile(path.join(evalDir, "pairs.csv"), "utf8").catch(() => {
    throw new LabelingDataError([
      `Could not read ${path.join(evalDir, "pairs.csv")}. Run the page from web/ with ml/evaluation/ next to it.`,
    ]);
  });
  const pairs = parsePairsCsv(pairsText);

  const jobIds = [...new Set(pairs.map((pair) => pair.jobId))].sort();
  const candidateIds = [...new Set(pairs.map((pair) => pair.candidateId))].sort();
  const problems: string[] = [];
  const hash = createHash("sha256").update(pairsText.replace(/\r\n/g, "\n"));
  const jobs: Record<string, JobRecord> = {};

  for (const id of jobIds) {
    try {
      const raw = await readFile(path.join(evalDir, "data", "jobs", `${id}.json`), "utf8");
      hash.update(`\n${id}\n`).update(raw);
      jobs[id] = parseJob(id, raw);
    } catch (error) {
      problems.push(
        error instanceof LabelingDataError
          ? error.message
          : `Missing data/jobs/${id}.json, which pairs.csv names.`
      );
    }
  }

  for (const id of candidateIds) {
    const candidateFile = path.join(evalDir, "data", "candidates", `${id}.json`);
    if (!(await exists(candidateFile))) {
      problems.push(`Missing data/candidates/${id}.json: L-9 would reject ratings for ${id}.`);
    } else {
      hash.update(`\n${id}\n`).update(await readFile(candidateFile));
    }
    const pdfFile = path.join(evalDir, "pdfs", `${id}.pdf`);
    if (!(await exists(pdfFile))) {
      problems.push(`Missing pdfs/${id}.pdf: there is no CV to read for ${id}.`);
    } else {
      hash.update(await readFile(pdfFile));
    }
  }

  if (problems.length) {
    problems.push("Rebuild the set with `python evaluation/build_eval_set.py` from ml/.");
    throw new LabelingDataError(problems);
  }
  return { datasetId: hash.digest("hex").slice(0, 16), pairs, jobs };
}

/**
 * The bytes of a candidate's CV, or `null` when `id` is not a candidate of the evaluation set.
 * Only ids named in `pairs.csv` are served, so the id never reaches the file system unchecked.
 */
export async function readCandidatePdf(
  id: string,
  evalDir: string = DEFAULT_EVAL_DIR
): Promise<Buffer | null> {
  if (!CANDIDATE_ID.test(id)) return null;
  const pairs = await readPairs(evalDir);
  if (!pairs.some((pair) => pair.candidateId === id)) return null;
  return readFile(path.join(evalDir, "pdfs", `${id}.pdf`)).catch(() => null);
}
