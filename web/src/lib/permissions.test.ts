import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can", () => {
  it("lets admins and recruiters read candidates", () => {
    expect(can("admin", "candidate:read")).toBe(true);
    expect(can("recruiter", "candidate:read")).toBe(true);
  });

  it("keeps viewers out of the full candidate list", () => {
    expect(can("viewer", "candidate:read")).toBe(false);
    expect(can("viewer", "candidate:write")).toBe(false);
  });

  it("denies everything when there is no role", () => {
    expect(can(undefined, "candidate:read")).toBe(false);
    expect(can(undefined, "cv-review:read")).toBe(false);
  });

  it("lets every role open the CV review screen, but only admins and recruiters edit", () => {
    for (const role of ["admin", "recruiter", "viewer"] as const) {
      expect(can(role, "cv-review:read")).toBe(true);
    }
    expect(can("viewer", "candidate:write")).toBe(false);
    expect(can("recruiter", "candidate:write")).toBe(true);
  });

  it("keeps admin-only actions admin-only", () => {
    expect(can("admin", "user:manage")).toBe(true);
    expect(can("recruiter", "user:manage")).toBe(false);
  });
});
