import { describe, expect, it } from "vitest";
import { mockCandidates } from "@/mocks/fixtures/candidates";
import { readParsedSummary } from "./parsed-cv";

describe("readParsedSummary", () => {
  it("returns null for an unparsed CV ({})", () => {
    expect(readParsedSummary({})).toBeNull();
  });

  it("returns null for anything that is not an object", () => {
    for (const value of [null, undefined, "text", 42, ["a"], true]) {
      expect(readParsedSummary(value)).toBeNull();
    }
  });

  it("returns null when no known field holds usable data", () => {
    expect(readParsedSummary({ foo: "bar", skills: [1, null, {}], experiences: "no" })).toBeNull();
  });

  it("reads schema 1.0", () => {
    // Alex Mercer's fixture is written in schema 1.0.
    const parsed = readParsedSummary(mockCandidates[0].parsed_data);
    expect(parsed).toMatchObject({
      headline: "Backend Software Engineer",
      experienceYears: 5.5,
      certifications: ["AWS Certified Developer"],
    });
    expect(parsed?.skills).toEqual(["Python", "FastAPI", "PostgreSQL", "Redis", "Git", "Docker"]);
    expect(parsed?.experiences[0]).toEqual({
      title: "Backend Software Engineer",
      company: "TechCorp Inc.",
      period: "May 2022 – Present",
    });
    expect(parsed?.experiences[1].period).toBe("Apr 2020 – Apr 2022");
    expect(parsed?.education[0]).toEqual({
      degree: "B.S. Computer Science",
      institution: "UC Berkeley",
      gradYear: 2020,
    });
    expect(parsed?.languages).toEqual([{ language: "English", level: "native" }]);
  });

  it("reads the older draft shape", () => {
    // Daniel Okonkwo's fixture still uses skills: string[] and work_history.
    const parsed = readParsedSummary(mockCandidates[2].parsed_data);
    expect(parsed?.skills).toContain("PyTorch");
    expect(parsed?.experiences[0]).toEqual({
      title: "ML Research Scientist",
      company: "DeepVision AI",
      period: "3 years",
    });
    expect(parsed?.education[0].degree).toBe("Ph.D. Machine Learning, Carnegie Mellon University");
  });

  it("skips malformed entries instead of throwing", () => {
    const parsed = readParsedSummary({
      skills: [{ raw: "Go" }, { normalized: "x" }, "", null, "Rust"],
      experiences: [{ company: "No title" }, { title: "Dev", start: "2020-13" }],
      education: [{ institution: "No degree" }],
    });
    expect(parsed?.skills).toEqual(["Go", "Rust"]);
    expect(parsed?.experiences).toEqual([
      { title: "Dev", company: null, period: "2020-13 – Present" },
    ]);
    expect(parsed?.education).toEqual([]);
  });
});
