import { describe, expect, it } from "vitest";
import {
  confidenceFor,
  describePointer,
  formatConfidence,
  LOW_CONFIDENCE_THRESHOLD,
  lowConfidenceFields,
  lowConfidenceFor,
  lowSectionConfidence,
  pointerFor,
} from "./confidence";

describe("lowConfidenceFor", () => {
  const confidence = {
    "/contact/email": 0.98,
    "/contact/phone": 0.5,
    "/skills/3/normalized": 0.62,
    "/experiences": 0.3,
  };

  it("flags only values below the threshold", () => {
    expect(lowConfidenceFor(confidence, "/contact/phone")).toBe(0.5);
    expect(lowConfidenceFor(confidence, "/contact/email")).toBeNull();
    expect(
      lowConfidenceFor({ "/contact/name": LOW_CONFIDENCE_THRESHOLD }, "/contact/name")
    ).toBeNull();
  });

  it("never treats a missing entry as low confidence", () => {
    expect(confidenceFor(confidence, "/contact/location")).toBeNull();
    expect(lowConfidenceFor(confidence, "/contact/location")).toBeNull();
    expect(lowConfidenceFor(undefined, "/contact/phone")).toBeNull();
    expect(lowConfidenceFor({}, "/contact/phone")).toBeNull();
  });

  it("applies a row's value to every field in that row", () => {
    const map = { "/experiences/1": 0.4 };
    expect(lowConfidenceFor(map, "/experiences/1/title")).toBe(0.4);
    expect(lowConfidenceFor(map, "/experiences/1/start")).toBe(0.4);
    expect(lowConfidenceFor(map, "/experiences/0/title")).toBeNull();
  });

  it("uses the lowest value that applies", () => {
    const map = { "/experiences/0": 0.6, "/experiences/0/start": 0.2 };
    expect(lowConfidenceFor(map, "/experiences/0/start")).toBe(0.2);
    expect(lowConfidenceFor(map, "/experiences/0/end")).toBe(0.6);
  });

  it("does not spread a whole-section value to every field in it", () => {
    expect(lowConfidenceFor(confidence, "/experiences/0/title")).toBeNull();
    expect(lowConfidenceFor(confidence, "/experiences/2/start")).toBeNull();
    expect(lowConfidenceFor(confidence, "/experiences")).toBe(0.3);
  });

  it("does not leak to siblings or to parents", () => {
    expect(lowConfidenceFor(confidence, "/skills/3/raw")).toBeNull();
    expect(lowConfidenceFor(confidence, "/skills/4/normalized")).toBeNull();
    expect(lowConfidenceFor(confidence, "/skills")).toBeNull();
  });
});

describe("lowSectionConfidence", () => {
  it("reports a low value recorded for a whole section", () => {
    expect(lowSectionConfidence({ "/experiences": 0.3 }, "experiences")).toBe(0.3);
  });

  it("ignores sections that are fine, missing, or only have low fields", () => {
    expect(lowSectionConfidence({ "/experiences": 0.9 }, "experiences")).toBeNull();
    expect(lowSectionConfidence({}, "experiences")).toBeNull();
    expect(lowSectionConfidence({ "/experiences/0/start": 0.1 }, "experiences")).toBeNull();
    expect(lowSectionConfidence(undefined, "experiences")).toBeNull();
  });
});

describe("pointerFor", () => {
  it("builds JSON pointers from the saved row index", () => {
    expect(pointerFor("skills", 3, "normalized")).toBe("/skills/3/normalized");
    expect(pointerFor("contact", "email")).toBe("/contact/email");
    expect(pointerFor("headline")).toBe("/headline");
  });
});

describe("lowConfidenceFields", () => {
  it("lists what is below the threshold, lowest first, and nothing else", () => {
    const fields = lowConfidenceFields({
      confidence: { "/contact/email": 0.98, "/skills/3/normalized": 0.62, "/contact/phone": 0.5 },
    });
    expect(fields.map((f) => f.pointer)).toEqual(["/contact/phone", "/skills/3/normalized"]);
    expect(fields[1]).toEqual({
      pointer: "/skills/3/normalized",
      confidence: 0.62,
      label: "Skill 4 · standard name",
    });
  });

  it("is empty without confidence data", () => {
    expect(lowConfidenceFields({})).toEqual([]);
  });
});

describe("describePointer / formatConfidence", () => {
  it("names pointers for people", () => {
    expect(describePointer("/contact/email")).toBe("Contact · email");
    expect(describePointer("/experiences")).toBe("Experiences");
    expect(describePointer("/experiences/0/start")).toBe("Experience 1 · start date");
    expect(describePointer("/headline")).toBe("Headline");
  });

  it("formats percentages", () => {
    expect(formatConfidence(0.625)).toBe("63%");
  });
});
