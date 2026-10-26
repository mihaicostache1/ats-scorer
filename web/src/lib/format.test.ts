import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, getInitials } from "./format";

describe("formatDate", () => {
  it("formats in UTC so server and browser agree", () => {
    expect(formatDate("2026-10-01T23:30:00Z")).toBe("Oct 1, 2026");
  });
});

describe("getInitials", () => {
  it("uses the first two words", () => {
    expect(getInitials("Alex Mercer")).toBe("AM");
    expect(getInitials("  maria  de la cruz ")).toBe("MD");
  });

  it("handles a single name and an empty one", () => {
    expect(getInitials("Madonna")).toBe("M");
    expect(getInitials("")).toBe("?");
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(48211)).toBe("47.1 KB");
    expect(formatBytes(1204557)).toBe("1.1 MB");
  });
});
