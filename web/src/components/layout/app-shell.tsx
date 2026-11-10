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

/** How long the mobile sidebar takes to slide away; about `--motion-base` (220ms). */
const NAV_EXIT_MS = 200;

export function AppShell({ children, className }: AppShellProps) {
  // "closing" keeps the slide-over mounted while it plays its exit, then it is removed.
  const [nav, setNav] = React.useState<"closed" | "open" | "closing">("closed");
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openNav = () => {
    clearTimeout(closeTimer.current);
    setNav("open");
  };
  const closeNav = () => {
    setNav("closing");
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setNav("closed"), NAV_EXIT_MS);
  };
  React.useEffect(() => () => clearTimeout(closeTimer.current), []);
  const leaving = nav === "closing";

  return (
    <ToastProvider>
      <div className="bg-ambient text-foreground flex min-h-screen flex-col">
        <AppHeader onToggleSidebar={() => (nav === "open" ? closeNav() : openNav())} />

        <div className="relative flex flex-1 overflow-hidden">
          {/* Desktop persistent sidebar */}
          <AppSidebar className="hidden lg:flex" />

          {/* Mobile slide-over sidebar */}
          {nav !== "closed" && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <div
                className={cn(
                  "ease-fluid fixed inset-0 bg-black/25 backdrop-blur-md duration-(--motion-base)",
                  leaving ? "animate-out fade-out fill-mode-forwards" : "animate-in fade-in"
                )}
                onClick={closeNav}
                aria-hidden="true"
              />
              {/* No fill of its own: the sidebar inside supplies the glass, so the blur isn't nested. */}
              <div
                className={cn(
                  "ease-fluid relative z-10 flex h-full w-72 max-w-full flex-col overflow-hidden rounded-r-2xl shadow-2xl duration-(--motion-base)",
                  leaving
                    ? "animate-out slide-out-to-left fill-mode-forwards"
                    : "animate-in slide-in-from-left"
                )}
              >
                <AppSidebar className="w-full flex-1 border-r-0" onItemClick={closeNav} />
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <main
            className={cn(
              "mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-5 py-8 sm:px-10 sm:py-10",
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
