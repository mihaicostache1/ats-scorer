import { describe, expect, it } from "vitest";
import { possibleDuplicates } from "./candidate-duplicates";
import { mockCandidates } from "../fixtures/candidates";

describe("mock candidate duplicate warnings", () => {
  const original = { ...mockCandidates[0], phone: "+40 721 123 456", parsed_data: {} };

  it.each(["Alex Mercar", "Alxe Mercer", "  MERCER, Álex  "])(
    "warns about name typo or formatting: %s",
    (full_name) => {
      const incoming = {
        ...original,
        id: "new",
        full_name,
        email: "other@example.com",
        phone: null,
      };
      expect(possibleDuplicates(incoming, [original, incoming])).toEqual([
        expect.objectContaining({ candidate_id: original.id, matched_on: ["name"] }),
      ]);
    }
  );

  it("combines contact reasons, ignores self and other organizations, and preserves records", () => {
    const incoming = {
      ...original,
      id: "new",
      full_name: "Unrelated Person",
      email: " ALEX.MERCER@EXAMPLE.COM ",
      phone: "0040 (721) 123-456",
    };
    const pool = [original, incoming, { ...original, id: "foreign", org_id: "different-org" }];
    const before = structuredClone(pool);
    expect(possibleDuplicates(incoming, pool)).toEqual([
      {
        candidate_id: original.id,
        full_name: original.full_name,
        matched_on: ["email", "phone"],
        name_similarity: null,
      },
    ]);
    expect(pool).toEqual(before);
  });

  it("includes saved parsed contacts after parsing", () => {
    const parsed = {
      ...original,
      id: "parsed",
      full_name: "Upload Placeholder",
      email: "placeholder@example.org",
      phone: null,
      parsed_data: { contact: { email: "ALEX.MERCER@EXAMPLE.COM" } },
    };
    expect(possibleDuplicates(parsed, [original, parsed])[0].matched_on).toEqual(["email"]);
  });
});
