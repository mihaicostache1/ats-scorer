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

export function AppShell({ children, className }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <ToastProvider>
      <div className="bg-ambient text-foreground flex min-h-screen flex-col">
        <AppHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <div className="relative flex flex-1 overflow-hidden">
          {/* Desktop persistent sidebar */}
          <AppSidebar className="hidden lg:flex" />

          {/* Mobile slide-over sidebar */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <div
                className="animate-in fade-in fixed inset-0 bg-black/25 backdrop-blur-md transition-opacity"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              {/* No fill of its own: the sidebar inside supplies the glass, so the blur isn't nested. */}
              <div className="animate-in slide-in-from-left relative z-10 flex h-full w-72 max-w-full flex-col overflow-hidden rounded-r-2xl shadow-2xl duration-200">
                <AppSidebar
                  className="w-full flex-1 border-r-0"
                  onItemClick={() => setSidebarOpen(false)}
                />
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
