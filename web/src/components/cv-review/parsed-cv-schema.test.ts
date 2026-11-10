import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkPatch,
  mergeForValidation,
  parsedCvSchema,
  reviewFormSchema,
  toFormValues,
  toPatch,
  type ParsedCV,
  type ReviewFormValues,
} from "./parsed-cv-schema";

const FIXTURES = path.resolve(process.cwd(), "../ml/ats_scoring/schemas/fixtures");
const load = (kind: "valid" | "invalid") =>
  readdirSync(path.join(FIXTURES, kind))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      data: JSON.parse(readFileSync(path.join(FIXTURES, kind, f), "utf8")) as unknown,
    }));

const full = JSON.parse(
  readFileSync(path.join(FIXTURES, "valid", "full.json"), "utf8")
) as ParsedCV;

/** Edits the form values of `parsed` and returns them. */
const edit = (change: (values: ReviewFormValues) => void, parsed: ParsedCV = full) => {
  const values = toFormValues(parsed);
  change(values);
  return values;
};

describe("parsedCvSchema stays in step with the shared L-10 fixtures", () => {
  it.each(load("valid"))("accepts valid/$name", ({ data }) => {
    expect(parsedCvSchema.safeParse(data).success).toBe(true);
  });

  it.each(load("invalid"))("rejects invalid/$name", ({ data }) => {
    expect(parsedCvSchema.safeParse(data).success).toBe(false);
  });

  it("finds fixtures to check", () => {
    expect(load("valid").length).toBeGreaterThan(0);
    expect(load("invalid").length).toBeGreaterThan(0);
  });
});

describe("toFormValues / toPatch", () => {
  it.each(load("valid"))("produces an empty patch when nothing changed ($name)", ({ data }) => {
    const parsed = data as ParsedCV;
    expect(toPatch(toFormValues(parsed), parsed)).toEqual({});
  });

  it("sends only the contact fields that changed", () => {
    const values = edit((v) => {
      v.contact.phone = " +40 700 000 000 ";
      v.contact.location = "";
    });
    expect(toPatch(values, full)).toEqual({
      contact: { phone: "+40 700 000 000", location: null },
    });
  });

  it("never sends source or confidence", () => {
    const values = edit((v) => (v.headline = "Staff Engineer"));
    const patch = toPatch(values, full);
    expect(patch).toEqual({ headline: "Staff Engineer" });
    expect(patch).not.toHaveProperty("source");
    expect(patch).not.toHaveProperty("confidence");
  });

  it("clears optional text with null and numbers with null", () => {
    const values = edit((v) => {
      v.summary = "";
      v.experience_years = "";
    });
    expect(toPatch(values, full)).toEqual({ summary: null, experience_years: null });
  });

  it("sends a changed list whole, keeping untouched rows exactly as saved", () => {
    const values = edit((v) => (v.skills[3].normalized = "Kubernetes (K8s)"));
    const patch = toPatch(values, full);
    expect(patch.skills).toHaveLength(full.skills.length);
    expect(patch.skills?.[0]).toBe(full.skills[0]);
    expect(patch.skills?.[3]).toEqual({ raw: "k8s", normalized: "Kubernetes (K8s)" });
    expect(patch).not.toHaveProperty("experiences");
  });

  it("turns a cleared standard name into null, and bullets into one entry per line", () => {
    const values = edit((v) => {
      v.skills[2].normalized = "  ";
      v.experiences[0].bullets = "First\n\n  Second  \n";
    });
    const patch = toPatch(values, full);
    expect(patch.skills?.[2]).toEqual({ raw: "Postgres", normalized: null });
    expect(patch.experiences?.[0].bullets).toEqual(["First", "Second"]);
  });

  it("handles added and removed rows", () => {
    const values = edit((v) => {
      v.languages.splice(0, 1);
      v.education.push({
        degree: "M.Sc. Data Science",
        institution: "",
        grad_year: "2022",
        originIndex: null,
      });
    });
    const patch = toPatch(values, full);
    expect(patch.languages).toEqual([full.languages?.[1]]);
    expect(patch.education).toEqual([
      full.education?.[0],
      { degree: "M.Sc. Data Science", institution: null, grad_year: 2022 },
    ]);
  });
});

describe("checkPatch", () => {
  it("accepts a valid correction", () => {
    const result = checkPatch(
      edit((v) => (v.headline = "Staff Engineer")),
      full
    );
    expect(result).toEqual({ ok: true, patch: { headline: "Staff Engineer" } });
  });

  it("refuses a patch whose merged profile is not valid L-10", () => {
    const cases: [string, (v: ReviewFormValues) => void][] = [
      ["empty skill", (v) => (v.skills[0].raw = "")],
      ["bad month", (v) => (v.experiences[0].start = "2022-13")],
      ["bad grad year", (v) => (v.education[0].grad_year = "1900")],
      ["negative years", (v) => (v.experience_years = "-3")],
      ["empty degree", (v) => (v.education[0].degree = " ")],
      ["empty language", (v) => (v.languages[0].language = "")],
    ];
    for (const [label, change] of cases) {
      const result = checkPatch(edit(change), full);
      expect(result.ok, label).toBe(false);
    }
  });

  it("reports where the problem is", () => {
    const result = checkPatch(
      edit((v) => (v.skills[1].raw = "")),
      full
    );
    expect(result).toMatchObject({ ok: false, issues: [{ path: "skills.1.raw" }] });
  });
});

describe("mergeForValidation", () => {
  it("merges objects and replaces lists, like the server", () => {
    const merged = mergeForValidation(full, {
      contact: { phone: "123" },
      skills: [{ raw: "Go", normalized: "Go" }],
    }) as ParsedCV;
    expect(merged.contact?.phone).toBe("123");
    expect(merged.contact?.email).toBe(full.contact?.email);
    expect(merged.skills).toEqual([{ raw: "Go", normalized: "Go" }]);
  });
});

describe("reviewFormSchema", () => {
  const validate = (values: ReviewFormValues, parsed: ParsedCV = full) =>
    reviewFormSchema(parsed).safeParse(values);
  const messageAt = (result: ReturnType<typeof validate>, ...pathParts: (string | number)[]) =>
    result.error?.issues.find((i) => i.path.join(".") === pathParts.join("."))?.message;

  it("accepts the saved profile as it is", () => {
    expect(validate(toFormValues(full)).success).toBe(true);
  });

  it("explains missing required fields next to them", () => {
    const result = validate(
      edit((v) => {
        v.skills[0].raw = "";
        v.experiences[0].title = "";
        v.education[0].degree = "";
        v.languages[0].language = "";
      })
    );
    expect(messageAt(result, "skills", 0, "raw")).toMatch(/skill/i);
    expect(messageAt(result, "experiences", 0, "title")).toMatch(/title/i);
    expect(messageAt(result, "education", 0, "degree")).toMatch(/degree/i);
    expect(messageAt(result, "languages", 0, "language")).toMatch(/language/i);
  });

  it("checks dates, years and experience", () => {
    const result = validate(
      edit((v) => {
        v.experiences[0].start = "May 2022";
        v.education[0].grad_year = "20x0";
        v.experience_years = "-1";
      })
    );
    expect(messageAt(result, "experiences", 0, "start")).toMatch(/YYYY-MM/);
    expect(messageAt(result, "education", 0, "grad_year")).toMatch(/1950 to 2100/);
    expect(messageAt(result, "experience_years")).toMatch(/number of years/);
  });

  it("does not let a found name or email be cleared, and checks a changed email", () => {
    expect(messageAt(validate(edit((v) => (v.contact.name = ""))), "contact", "name")).toMatch(
      /can't be cleared/
    );
    expect(messageAt(validate(edit((v) => (v.contact.email = ""))), "contact", "email")).toMatch(
      /can't be cleared/
    );
    expect(
      messageAt(validate(edit((v) => (v.contact.email = "not-an-email"))), "contact", "email")
    ).toMatch(/valid email/);
  });

  it("lets phone and location be cleared", () => {
    const result = validate(
      edit((v) => {
        v.contact.phone = "";
        v.contact.location = "";
      })
    );
    expect(result.success).toBe(true);
  });

  it("only applies the contact limits to values that changed", () => {
    const sloppy: ParsedCV = {
      ...full,
      contact: { ...full.contact, email: "jane@", phone: "9".repeat(80) },
    };
    // Untouched parser values are never sent, so they must not block saving something else.
    expect(validate(toFormValues(sloppy), sloppy).success).toBe(true);
    expect(toPatch(toFormValues(sloppy), sloppy)).toEqual({});

    const tooLong = edit((v) => (v.contact.phone = "9".repeat(51)), sloppy);
    expect(messageAt(validate(tooLong, sloppy), "contact", "phone")).toMatch(/At most 50/);
  });
});
