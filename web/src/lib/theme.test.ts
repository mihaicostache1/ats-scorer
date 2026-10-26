import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, parseTheme, resolveTheme, THEME_STORAGE_KEY, themeInitScript } from "./theme";

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.className = "";
  html.style.colorScheme = "";
});
afterEach(() => vi.restoreAllMocks());

describe("parseTheme", () => {
  it("keeps the three known choices", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
  });

  it("falls back to system for anything else", () => {
    for (const value of [null, undefined, "", "Dark", "blue", 1, {}]) {
      expect(parseTheme(value)).toBe("system");
    }
  });
});

describe("resolveTheme", () => {
  it("follows the OS only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the OS when the user chose", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets the dark class and color-scheme, and removes them again", () => {
    applyTheme("dark");
    expect(html).toHaveClass("dark");
    expect(html.style.colorScheme).toBe("dark");

    applyTheme("light");
    expect(html).not.toHaveClass("dark");
    expect(html.style.colorScheme).toBe("light");
  });

  it("leaves other classes alone", () => {
    html.classList.add("antialiased");
    applyTheme("dark");
    applyTheme("light");
    expect(html).toHaveClass("antialiased");
  });
});

describe("themeInitScript (runs before the page paints)", () => {
  const run = () => new Function(themeInitScript)();
  const osPrefersDark = (dark: boolean) =>
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: dark }))
    );

  it("uses a saved dark choice even if the OS is light", () => {
    osPrefersDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(html).toHaveClass("dark");
    expect(html.style.colorScheme).toBe("dark");
  });

  it("uses a saved light choice even if the OS is dark", () => {
    osPrefersDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    run();
    expect(html).not.toHaveClass("dark");
    expect(html.style.colorScheme).toBe("light");
  });

  it.each([["system"], [null], ["garbage"]])("follows the OS when the choice is %s", (saved) => {
    if (saved !== null) localStorage.setItem(THEME_STORAGE_KEY, saved);
    osPrefersDark(true);
    run();
    expect(html).toHaveClass("dark");

    html.className = "";
    osPrefersDark(false);
    run();
    expect(html).not.toHaveClass("dark");
  });

  it("still follows the OS when storage is blocked", () => {
    osPrefersDark(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
    expect(html).toHaveClass("dark");
  });

  it("falls back to light when there is no matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(run).not.toThrow();
    expect(html).not.toHaveClass("dark");
    expect(html.style.colorScheme).toBe("light");
  });

  it("agrees with resolveTheme for every combination", () => {
    for (const saved of ["light", "dark", "system"] as const) {
      for (const osDark of [true, false]) {
        html.className = "";
        localStorage.setItem(THEME_STORAGE_KEY, saved);
        osPrefersDark(osDark);
        run();
        expect(html.classList.contains("dark")).toBe(resolveTheme(saved, osDark) === "dark");
      }
    }
  });
});
