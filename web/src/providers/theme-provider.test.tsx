import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeProvider, useTheme } from "./theme-provider";

const html = document.documentElement;

/** A controllable stand-in for the OS dark-mode setting. */
function stubOs(initiallyDark: boolean) {
  let dark = initiallyDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }))
  );
  return {
    set(next: boolean) {
      dark = next;
      act(() => listeners.forEach((fn) => fn()));
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <output data-testid="state">{`${theme}/${resolvedTheme}`}</output>
      <button onClick={() => setTheme("light")}>light</button>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </>
  );
}
const state = () => screen.getByTestId("state").textContent;
const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );

beforeEach(() => {
  localStorage.clear();
  html.className = "";
  html.style.colorScheme = "";
});
afterEach(() => vi.restoreAllMocks());

describe("ThemeProvider", () => {
  it("follows the OS until the user chooses", () => {
    stubOs(true);
    renderProbe();
    expect(state()).toBe("system/dark");
    expect(html).toHaveClass("dark");
  });

  it("applies and remembers a choice", async () => {
    stubOs(false);
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText("dark"));
    expect(state()).toBe("dark/dark");
    expect(html).toHaveClass("dark");
    expect(html.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByText("light"));
    expect(state()).toBe("light/light");
    expect(html).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("starts from a saved choice, whatever the OS says", () => {
    stubOs(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderProbe();
    expect(state()).toBe("light/light");
    expect(html).not.toHaveClass("dark");
  });

  it("ignores a saved value it doesn't know", () => {
    stubOs(false);
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    renderProbe();
    expect(state()).toBe("system/light");
  });

  it("follows the OS live while on system, but not once the user has chosen", async () => {
    const os = stubOs(false);
    const user = userEvent.setup();
    renderProbe();
    expect(html).not.toHaveClass("dark");

    os.set(true);
    expect(state()).toBe("system/dark");
    expect(html).toHaveClass("dark");

    await user.click(screen.getByText("light"));
    os.set(false);
    os.set(true);
    expect(state()).toBe("light/light");
    expect(html).not.toHaveClass("dark");
  });

  it("picks up a change made in another tab", () => {
    stubOs(false);
    renderProbe();
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(state()).toBe("dark/dark");
    expect(html).toHaveClass("dark");
  });

  it("puts the theme back if the page's attributes were reset", () => {
    stubOs(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    html.className = ""; // what a development remount can do
    renderProbe();
    expect(html).toHaveClass("dark");
  });

  it("works when matchMedia doesn't exist", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const user = userEvent.setup();
    renderProbe();
    expect(state()).toBe("system/light");
    await user.click(screen.getByText("dark"));
    expect(state()).toBe("dark/dark");
  });

  it("still works for the session when storage is blocked", async () => {
    stubOs(false);
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderProbe();
    await user.click(screen.getByText("dark"));
    expect(state()).toBe("dark/dark");
    expect(html).toHaveClass("dark");

    // Storage is back: the next choice is saved and the in-memory one is dropped.
    vi.restoreAllMocks();
    await user.click(screen.getByText("system"));
    expect(state()).toBe("system/light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("stops listening when it is removed", () => {
    const os = stubOs(false);
    const { unmount } = renderProbe();
    expect(os.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(os.listenerCount()).toBe(0);
  });
});

describe("useTheme without a provider", () => {
  it("returns a harmless default instead of throwing", () => {
    render(<Probe />);
    expect(state()).toBe("system/light");
    expect(() => screen.getByText("dark").click()).not.toThrow();
  });
});
