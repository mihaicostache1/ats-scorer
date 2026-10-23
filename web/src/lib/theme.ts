/**
 * Light / dark theme helpers. The choice ("light", "dark" or "system") is kept in localStorage; the
 * `dark` class and `color-scheme` on <html> are what actually restyle the page (see globals.css).
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ats-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Anything that isn't a known choice (missing, edited by hand, from an older version) is "system". */
export function parseTheme(raw: unknown): Theme {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

/** What the page should look like, given the choice and whether the OS prefers dark. */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return theme;
}

export function applyTheme(resolved: ResolvedTheme, root: HTMLElement = document.documentElement) {
  root.classList.toggle("dark", resolved === "dark");
  // Lets the browser draw native controls, scrollbars and the empty canvas to match.
  root.style.colorScheme = resolved;
}

/**
 * Runs in <head> before the first paint so the right theme is on the page before React loads (no
 * flash of the wrong one). It is the same decision as `resolveTheme`, as plain script text, and it
 * never throws: blocked storage or a missing `matchMedia` just fall back to the OS or to light.
 */
export const themeInitScript = `(function(){var r=document.documentElement,t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})}catch(e){}var d=false;try{d=t==="dark"||(t!=="light"&&window.matchMedia(${JSON.stringify(
  DARK_QUERY
)}).matches)}catch(e){}r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})();`;
