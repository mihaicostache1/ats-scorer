"use client";

import * as React from "react";
import {
  applyTheme,
  DARK_QUERY,
  parseTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

/**
 * The theme lives outside React (localStorage and the OS setting), so components read it with
 * `useSyncExternalStore`. On the server, and while hydrating, they see "system"; the page itself
 * is already styled correctly by the inline script in the root layout.
 */

const listeners = new Set<() => void>();
/** Only used when localStorage is blocked, so the choice still works until the tab closes. */
let memoryTheme: Theme | null = null;

function readTheme(): Theme {
  if (memoryTheme) return memoryTheme;
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function darkQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY)
    : null;
}
const readSystemDark = () => darkQuery()?.matches ?? false;

/** Puts the current choice on the page. */
function applyCurrent() {
  applyTheme(resolveTheme(readTheme(), readSystemDark()));
}

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed the choice.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) {
      applyCurrent();
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeSystem(onChange: () => void) {
  const query = darkQuery();
  if (!query) return () => {};
  // The OS changed; only matters while the choice is "system".
  const onSystemChange = () => {
    applyCurrent();
    onChange();
  };
  query.addEventListener("change", onSystemChange);
  return () => query.removeEventListener("change", onSystemChange);
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    memoryTheme = null;
  } catch {
    memoryTheme = theme;
  }
  applyCurrent();
  notify();
}

interface ThemeContextValue {
  /** What the user chose. */
  theme: Theme;
  /** What is showing right now ("system" resolved to light or dark). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  const systemDark = React.useSyncExternalStore(subscribeSystem, readSystemDark, () => false);

  // React can reset <html> attributes when it remounts in development; put the theme back.
  React.useLayoutEffect(() => {
    applyCurrent();
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: resolveTheme(theme, systemDark), setTheme: storeTheme }),
    [theme, systemDark]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Works without a provider (as "system"), so components that show the toggle are easy to test. */
export function useTheme() {
  return React.useContext(ThemeContext);
}
