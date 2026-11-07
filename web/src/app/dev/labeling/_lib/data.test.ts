// @vitest-environment node
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EVAL_DIR,
  LabelingDataError,
  loadLabelingData,
  parsePairsCsv,
  readCandidatePdf,
  readPairs,
} from "./data";

describe("parsePairsCsv", () => {
  const header = "candidate_id,job_id,rating";

  it("reads pairs in file order and ignores the blank rating column", () => {
    expect(parsePairsCsv(`${header}\r\nC002,J01,\r\nC001,J01,3\r\nC001,J07,\r\n`)).toEqual([
      { candidateId: "C002", jobId: "J01" },
      { candidateId: "C001", jobId: "J01" },
      { candidateId: "C001", jobId: "J07" },
    ]);
  });

  it("accepts LF endings, a BOM and no final newline", () => {
    expect(parsePairsCsv(`﻿${header}\nC001,J01,`)).toEqual([{ candidateId: "C001", jobId: "J01" }]);
  });

  it.each([
    ["a wrong header", "candidate,job,rating\r\nC001,J01,\r\n", /header/],
    ["a short row", `${header}\r\nC001,J01\r\n`, /3 columns/],
    ["a long row", `${header}\r\nC001,J01,1,extra\r\n`, /3 columns/],
    ["a blank line in the middle", `${header}\r\nC001,J01,\r\n\r\nC002,J01,\r\n`, /3 columns/],
    ["a duplicate pair", `${header}\r\nC001,J01,\r\nC001,J01,\r\n`, /twice/],
    ["no pairs", `${header}\r\n`, /no pairs/],
    ["an empty file", "", /header/],
  ])("rejects %s", (_name, text, message) => {
    expect(() => parsePairsCsv(text)).toThrow(LabelingDataError);
    expect(() => parsePairsCsv(text)).toThrow(message);
  });

  it.each(["../C001", "C001/../x", "c001", "C", "C1a", "X001", " "])(
    "rejects the candidate id %j, because ids end up in file paths",
    (id) => {
      expect(() => parsePairsCsv(`${header}\r\n${id},J01,\r\n`)).toThrow(
        /not a candidate and job id/
      );
    }
  );

  it("rejects a bad job id", () => {
    expect(() => parsePairsCsv(`${header}\r\nC001,../J01,\r\n`)).toThrow(
      /not a candidate and job id/
    );
  });

  it("reports every problem, not just the first", () => {
    try {
      parsePairsCsv(`${header}\r\nC001,J01\r\nbad,J01,\r\n`);
      expect.unreachable();
    } catch (error) {
      expect((error as LabelingDataError).problems).toHaveLength(2);
    }
  });
});

describe("the real evaluation set", () => {
  it("has the 30 pairs, 3 jobs and 22 CVs that docs/ml/evaluation.md describes", async () => {
    const data = await loadLabelingData();

    expect(data.pairs).toHaveLength(30);
    expect(Object.keys(data.jobs).sort()).toEqual(["J01", "J07", "J10"]);
    expect(new Set(data.pairs.map((pair) => pair.candidateId)).size).toBe(22);
    expect(data.jobs.J01.title).toBe("Senior Backend Engineer");
    expect(data.jobs.J01.min_experience_years).toBe(6);
    expect(data.jobs.J01.required_skills).toContain("Python");
  });

  it("keeps the pairs grouped by job, as they are meant to be rated", async () => {
    const { pairs } = await loadLabelingData();
    expect(pairs.slice(0, 10).every((pair) => pair.jobId === "J01")).toBe(true);
    expect(pairs.slice(10, 20).every((pair) => pair.jobId === "J07")).toBe(true);
    expect(pairs.slice(20).every((pair) => pair.jobId === "J10")).toBe(true);
  });

  it("gives the same dataset id every time", async () => {
    const [a, b] = await Promise.all([loadLabelingData(), loadLabelingData()]);
    expect(a.datasetId).toMatch(/^[0-9a-f]{16}$/);
    expect(a.datasetId).toBe(b.datasetId);
  });

  it("serves a CV as a PDF", async () => {
    const pdf = await readCandidatePdf("C001");
    expect(pdf?.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("serves no file for an id that is not in pairs.csv, or that is not an id at all", async () => {
    expect(await readCandidatePdf("C999")).toBeNull();
    for (const id of ["../pairs", "..%2Fpairs", "C001/../../pairs", "c001", "", "C001.pdf"]) {
      expect(await readCandidatePdf(id)).toBeNull();
    }
  });
});

describe("a broken evaluation set", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "labeling-"));
    await cp(DEFAULT_EVAL_DIR, dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const problemsOf = async () => {
    try {
      await loadLabelingData(dir);
      return [];
    } catch (error) {
      expect(error).toBeInstanceOf(LabelingDataError);
      return (error as LabelingDataError).problems;
    }
  };

  it("loads a clean copy", async () => {
    expect(await problemsOf()).toEqual([]);
  });

  it("names a missing PDF and how to rebuild the set", async () => {
    await rm(path.join(dir, "pdfs", "C001.pdf"));
    const problems = await problemsOf();
    expect(problems.some((p) => p.includes("pdfs/C001.pdf"))).toBe(true);
    expect(problems.at(-1)).toMatch(/build_eval_set\.py/);
  });

  it("names a candidate missing from data/, which L-9 would reject", async () => {
    await rm(path.join(dir, "data", "candidates", "C004.json"));
    const problems = await problemsOf();
    expect(problems.some((p) => p.includes("data/candidates/C004.json") && p.includes("L-9"))).toBe(
      true
    );
  });

  it("names a missing job", async () => {
    await rm(path.join(dir, "data", "jobs", "J07.json"));
    expect((await problemsOf()).some((p) => p.includes("J07"))).toBe(true);
  });

  it("rejects a job file that is not valid", async () => {
    await writeFile(path.join(dir, "data", "jobs", "J10.json"), "{not json");
    expect((await problemsOf()).some((p) => p.includes("J10.json is not valid JSON"))).toBe(true);

    await writeFile(path.join(dir, "data", "jobs", "J10.json"), JSON.stringify({ title: "x" }));
    expect((await problemsOf()).some((p) => p.includes("missing a field"))).toBe(true);
  });

  it("reports everything wrong at once", async () => {
    await rm(path.join(dir, "pdfs", "C001.pdf"));
    await rm(path.join(dir, "pdfs", "C003.pdf"));
    const problems = await problemsOf();
    expect(problems.filter((p) => p.includes("pdfs/")).length).toBe(2);
  });

  it("explains a missing pairs.csv", async () => {
    await rm(path.join(dir, "pairs.csv"));
    await expect(readPairs(dir)).rejects.toThrow(/Could not read/);
    await expect(loadLabelingData(dir)).rejects.toThrow(/Could not read/);
  });

  it("changes the dataset id when a CV, a job or the pairs change", async () => {
    const original = (await loadLabelingData(dir)).datasetId;

    const job = path.join(dir, "data", "jobs", "J01.json");
    const jobText = await readFile(job, "utf8");
    await writeFile(job, jobText.replace("Senior", "Staff"));
    const afterJob = (await loadLabelingData(dir)).datasetId;
    expect(afterJob).not.toBe(original);

    await writeFile(job, jobText);
    expect((await loadLabelingData(dir)).datasetId).toBe(original);

    const pdf = path.join(dir, "pdfs", "C001.pdf");
    await writeFile(pdf, Buffer.concat([await readFile(pdf), Buffer.from("\n%changed")]));
    expect((await loadLabelingData(dir)).datasetId).not.toBe(original);
  });

  it("does not change the dataset id for line endings alone", async () => {
    const original = (await loadLabelingData(dir)).datasetId;
    const pairs = path.join(dir, "pairs.csv");
    const text = await readFile(pairs, "utf8");
    await writeFile(pairs, text.replace(/\r\n/g, "\n"));
    expect((await loadLabelingData(dir)).datasetId).toBe(original);
  });
});
