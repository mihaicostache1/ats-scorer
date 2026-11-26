"use client";

import * as React from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

/** How long the mobile sidebar takes to slide away; about `--motion-base` (200ms). */
const NAV_EXIT_MS = 180;
const COLLAPSE_KEY = "ats-sidebar-collapsed";

/** The desktop collapse choice, from localStorage, read without a hydration mismatch. */
function useCollapsed(): [boolean, () => void] {
  const subscribe = React.useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener("ats-sidebar", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("ats-sidebar", onChange);
    };
  }, []);
  const read = () => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  };
  const collapsed = React.useSyncExternalStore(subscribe, read, () => false);
  const toggle = React.useCallback(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // Storage blocked: the toggle simply doesn't persist.
    }
    window.dispatchEvent(new Event("ats-sidebar"));
  }, [collapsed]);
  return [collapsed, toggle];
}

export function AppShell({ children, className }: AppShellProps) {
  // "closing" keeps the slide-over mounted while it plays its exit, then it is removed.
  const [nav, setNav] = React.useState<"closed" | "open" | "closing">("closed");
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const [collapsed, toggleCollapsed] = useCollapsed();

  const openNav = () => {
    clearTimeout(closeTimer.current);
    setNav("open");
  };
  const closeNav = React.useCallback(() => {
    setNav((current) => (current === "closed" ? current : "closing"));
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setNav("closed"), NAV_EXIT_MS);
  }, []);
  React.useEffect(() => () => clearTimeout(closeTimer.current), []);

  // The drawer is modal: Escape closes it, focus moves in and stays in until it closes.
  React.useEffect(() => {
    if (nav !== "open") return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNav();
      if (event.key !== "Tab" || !drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nav, closeNav]);

  const leaving = nav === "closing";

  return (
    <ToastProvider>
      <div className="text-foreground flex min-h-screen">
        <a
          href="#app-main"
          className="bg-foreground text-background sr-only z-[60] rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>

        {/* Desktop persistent sidebar */}
        <AppSidebar
          className="sticky top-0 hidden h-screen shrink-0 lg:flex"
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />

        {/* Mobile slide-over sidebar */}
        {nav !== "closed" && (
          <div
            className="fixed inset-0 z-50 flex lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div
              className={cn(
                "ease-fluid fixed inset-0 bg-(--overlay-scrim) backdrop-blur-[4px] duration-(--motion-base)",
                leaving ? "animate-out fade-out fill-mode-forwards" : "animate-in fade-in"
              )}
              onClick={closeNav}
              aria-hidden="true"
            />
            <div
              ref={drawerRef}
              className={cn(
                "ease-fluid relative z-10 flex h-full w-72 max-w-[85vw] flex-col shadow-2xl duration-(--motion-base)",
                leaving
                  ? "animate-out slide-out-to-left fill-mode-forwards"
                  : "animate-in slide-in-from-left"
              )}
            >
              <AppSidebar className="w-full flex-1" onItemClick={closeNav} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader onToggleSidebar={() => (nav === "open" ? closeNav() : openNav())} />
          <main
            id="app-main"
            tabIndex={-1}
            className={cn(
              "mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8",
              className
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
