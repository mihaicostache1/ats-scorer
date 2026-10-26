"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/providers/session-provider";
import { ThemeToggle } from "./theme-toggle";

/** Top toolbar: brand and global actions only. Navigation lives in the sidebar. */
export function AppHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, signOut } = useSession();
  const initials = (user?.full_name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="glass-header sticky top-0 z-40 w-full">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              className="text-primary lg:hidden"
              aria-label="Toggle navigation menu"
            >
              <Menu className="size-5" />
            </Button>
          )}

          <Link
            href="/"
            className="text-foreground focus-visible:ring-primary/25 flex items-center gap-2.5 rounded-lg px-1 font-semibold tracking-tight hover:opacity-80 focus-visible:ring-4 focus-visible:outline-none"
          >
            <div className="text-primary-foreground flex size-8 items-center justify-center rounded-[22%] bg-gradient-to-b from-[#3395ff] to-[#007aff] text-xs font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_4px_12px_-2px_rgb(0_122_255/0.5)]">
              ATS
            </div>
            <span className="text-headline hidden sm:inline-block">ATS Scorer</span>
          </Link>
        </div>

        {/* Right header actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          <div className="border-border hidden items-center gap-3 border-l pl-3 sm:flex">
            <div
              className="glass-subtle text-primary flex size-8 items-center justify-center rounded-full text-xs font-semibold"
              aria-hidden="true"
            >
              {initials || "?"}
            </div>
            <div className="hidden text-left lg:block">
              <div className="flex items-center gap-2 text-sm leading-tight font-semibold">
                {user?.full_name}
                <Badge variant="secondary" className="px-2 py-0 text-xs capitalize">
                  {user?.role}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">{user?.email}</div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
