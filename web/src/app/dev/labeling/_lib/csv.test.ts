// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvFileName, exportLooseRatingsCsv, exportRatingsCsv, raterSlug } from "./csv";
import { parsePairsCsv } from "./data";
import { pairKey, type Rating } from "./types";

const EVAL_DIR = path.resolve(process.cwd(), "..", "ml", "evaluation");
const read = (...parts: string[]) => readFileSync(path.join(EVAL_DIR, ...parts), "utf8");
const names = (dir: string, ext: string) =>
  readdirSync(path.join(EVAL_DIR, dir))
    .filter((file) => file.endsWith(ext))
    .map((file) => file.slice(0, -ext.length));

const pairsText = read("pairs.csv");
const pairs = parsePairsCsv(pairsText);

/**
 * What `load_ratings` in ml/ats_scoring/evaluate.py does, line for line: UTF-8 with an optional BOM,
 * a header holding the three columns, empty ratings skipped, any other value exactly "0".."3".
 * Throws where it would exit.
 */
function loadRatingsLikeL9(text: string): Map<string, number> {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const header = lines[0].split(",");
  for (const column of ["candidate_id", "job_id", "rating"]) {
    if (!header.includes(column)) throw new Error(`no ${column} column`);
  }
  const ratings = new Map<string, number>();
  lines.slice(1).forEach((line, index) => {
    const cells = Object.fromEntries(line.split(",").map((cell, i) => [header[i], cell]));
    const value = (cells.rating ?? "").trim();
    if (!value) return;
    if (!["0", "1", "2", "3"].includes(value)) {
      throw new Error(`line ${index + 2}: rating must be 0, 1, 2 or 3, not '${value}'`);
    }
    ratings.set(`${cells.candidate_id.trim()}|${cells.job_id.trim()}`, Number(value));
  });
  return ratings;
}

describe("exportRatingsCsv", () => {
  it("is byte for byte ml/evaluation/pairs.csv before anything is rated", () => {
    expect(exportRatingsCsv(pairs, {})).toBe(pairsText);
  });

  it("fills in the rating column and nothing else", () => {
    const ratings: Record<string, Rating> = {
      [pairKey(pairs[0])]: 3,
      [pairKey(pairs[1])]: 0,
      [pairKey(pairs[29])]: 2,
    };
    const lines = exportRatingsCsv(pairs, ratings).split("\r\n");

    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toBe(`${pairs[0].candidateId},${pairs[0].jobId},3`);
    expect(lines[2]).toBe(`${pairs[1].candidateId},${pairs[1].jobId},0`);
    expect(lines[3]).toBe(`${pairs[2].candidateId},${pairs[2].jobId},`);
    expect(lines[30]).toBe(`${pairs[29].candidateId},${pairs[29].jobId},2`);
  });

  it("keeps all 30 pairs in file order, with CRLF endings, no BOM and no blank lines", () => {
    const text = exportRatingsCsv(pairs, { [pairKey(pairs[4])]: 1 });
    expect(text.startsWith(CSV_HEADER)).toBe(true);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const rows = text.split("\r\n").slice(1, -1);
    expect(rows).toHaveLength(30);
    expect(rows.map((row) => row.split(",").slice(0, 2).join("|"))).toEqual(pairs.map(pairKey));
  });

  it("writes a skipped or unrated pair as an empty cell, never as a placeholder", () => {
    const text = exportRatingsCsv(pairs, { [pairKey(pairs[0])]: 1 });
    const empty = text.split("\r\n").slice(2, -1);
    expect(empty).toHaveLength(29);
    for (const row of empty) expect(row).toMatch(/^C\d+,J\d+,$/);
  });
});

describe("what L-9 does with the export", () => {
  const evaluationCandidates = new Set(names("data/candidates", ".json"));
  const evaluationJobs = new Set(names("data/jobs", ".json"));

  it("loads a partly rated export without edits", () => {
    const ratings: Record<string, Rating> = {};
    pairs.forEach((pair, index) => {
      if (index % 3 !== 2) ratings[pairKey(pair)] = (index % 4) as Rating;
    });
    const loaded = loadRatingsLikeL9(exportRatingsCsv(pairs, ratings));
    expect(loaded.size).toBe(Object.keys(ratings).length);
    for (const [key, value] of loaded) expect(value).toBe(ratings[key]);
  });

  it("only names candidates and jobs that are in data/, so L-9 does not reject them", () => {
    const loaded = loadRatingsLikeL9(
      exportRatingsCsv(pairs, Object.fromEntries(pairs.map((p) => [pairKey(p), 2 as Rating])))
    );
    expect(loaded.size).toBe(30);
    for (const key of loaded.keys()) {
      const [candidateId, jobId] = key.split("|");
      expect(evaluationCandidates.has(candidateId)).toBe(true);
      expect(evaluationJobs.has(jobId)).toBe(true);
    }
  });

  it("loads an unrated export too: it has no ratings and L-9 skips every row", () => {
    expect(loadRatingsLikeL9(exportRatingsCsv(pairs, {})).size).toBe(0);
  });

  it("gives back the committed ratings file byte for byte", () => {
    // ratings/mihai.csv is the rater file L-9 ships with. Read as L-9 reads it and written by the
    // tool, it must be the same file.
    const committed = read("ratings", "mihai.csv");
    const ratings: Record<string, Rating> = {};
    for (const [key, value] of loadRatingsLikeL9(committed)) ratings[key] = value as Rating;
    expect(Object.keys(ratings).length).toBeGreaterThan(0);
    expect(exportRatingsCsv(pairs, ratings)).toBe(committed);
  });

  it("the emulation really rejects what L-9 rejects", () => {
    expect(() => loadRatingsLikeL9("candidate_id,job_id,rating\r\nC001,J01,4\r\n")).toThrow(
      /0, 1, 2 or 3/
    );
    expect(() => loadRatingsLikeL9("candidate_id,job_id,rating\r\nC001,J01,3.0\r\n")).toThrow();
    expect(() => loadRatingsLikeL9("candidate,job,score\r\n")).toThrow(/no candidate_id column/);
  });
});

describe("raterSlug / csvFileName", () => {
  it.each([
    ["Mihai", "mihai"],
    ["  Ana Maria ", "ana-maria"],
    ["Andrei_2", "andrei_2"],
    ["Éva", "eva"],
    ["../etc/passwd", "etc-passwd"],
    ["a.b.csv", "a-b-csv"],
    ["---", ""],
    ["   ", ""],
    ["日本語", ""],
    ["x".repeat(80), "x".repeat(40)],
  ])("turns %j into %j", (name, slug) => {
    expect(raterSlug(name)).toBe(slug);
  });

  it("only produces characters that are safe in a file name and in an L-9 rater name", () => {
    for (const name of ["a b", "..", "con:", "a/b\\c", "q?*", "%00"]) {
      expect(raterSlug(name)).toMatch(/^[a-z0-9_-]*$/);
    }
  });

  it("names the file after the rater", () => {
    expect(csvFileName("mihai")).toBe("mihai.csv");
  });
});

describe("exportLooseRatingsCsv", () => {
  it("writes valid ratings as they were saved, sorted, and nothing else", () => {
    const text = exportLooseRatingsCsv({
      "C009|J01": 2,
      "C001|J01": 3,
      "C002|J01": 4,
      "C003|J01": "2",
      "C004|J01": 1.5,
      "not a key": 1,
      "C005|J01|extra": 1,
    });
    expect(text).toBe(`${CSV_HEADER}\r\nC001,J01,3\r\nC009,J01,2\r\n`);
  });

  it("is just the header when there is nothing to rescue", () => {
    expect(exportLooseRatingsCsv({})).toBe(`${CSV_HEADER}\r\n`);
  });
});
