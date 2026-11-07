"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Warns before unsaved edits are thrown away.
 *
 * - Closing the tab or reloading shows the browser's own prompt (`beforeunload`).
 * - A click on a same-origin link (the sidebar, "Back to candidate", a breadcrumb) is held back and
 *   reported in `pendingHref`; show a confirmation and then call `leave()` or `stay()`. It is caught
 *   in the capture phase, ahead of Next's `<Link>` handler, so no navigation starts. Links that open a
 *   new tab or window, downloads and same-page links are left alone.
 *
 * Not covered: the browser's Back button. The App Router offers no hook to veto it, so the
 * `beforeunload` prompt only appears when it leaves the app.
 */
export function useUnsavedChangesGuard(active: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some browsers only show the prompt when a return value is set.
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location.pathname + window.location.search;
      if (url.pathname + url.search === here) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);

  const stay = React.useCallback(() => setPendingHref(null), []);
  const leave = React.useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  }, [pendingHref, router]);

  // Nothing is pending once the form is clean, whatever was held back earlier.
  return { pendingHref: active ? pendingHref : null, stay, leave };
}
