"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";
import { SEGMENT_LABELS } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Crumb {
  label: string;
  href: string | null;
}

/**
 * Breadcrumbs from the path. Ids become "Job" or "Candidate"; segments that have no page of their
 * own (`/cvs`, a CV id) are folded into the next crumb rather than linking nowhere.
 */
export function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    if (part === "cvs" || (parts[i - 1] === "cvs" && UUID.test(part))) continue;
    if (UUID.test(part) || /^\d+$/.test(part)) {
      const parent = parts[i - 1];
      crumbs.push({
        label: parent === "jobs" ? "Job" : parent === "candidates" ? "Candidate" : "Details",
        href,
      });
      continue;
    }
    // "dev" has no page of its own.
    crumbs.push({ label: SEGMENT_LABELS[part] ?? part, href: part === "dev" ? null : href });
  }
  return crumbs;
}

function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-[13px]">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${i}`}
              className={cn("flex min-w-0 items-center gap-1", !last && "hidden sm:flex")}
            >
              {i > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="text-muted-foreground/70 hidden size-3.5 shrink-0 sm:block"
                />
              )}
              {last || !crumb.href ? (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "truncate",
                    last ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring truncate rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AccountMenu() {
  const { user, signOut } = useSession();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${user.full_name}`}
        className="hover:bg-secondary focus-visible:ring-ring aria-expanded:bg-secondary flex h-8 items-center gap-2 rounded-md pr-2 pl-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="bg-ink-950 text-canvas dark:bg-ink-700 flex size-6 items-center justify-center rounded-[5px] text-[10.5px] font-semibold"
        >
          {getInitials(user.full_name)}
        </span>
        <span className="text-foreground hidden max-w-36 truncate text-[13px] font-medium md:block">
          {user.full_name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuHeader>
          <p className="text-foreground truncate text-sm font-medium">{user.full_name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          <p className="text-muted-foreground mt-2 font-mono text-[11px] tracking-wide uppercase">
            Role · {user.role}
          </p>
        </DropdownMenuHeader>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact contextual bar: where you are on the left, theme and account on the right. */
export function AppHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  return (
    <header className="glass-bar sticky top-0 z-30 border-b border-(--glass-border)">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              className="-ml-1.5 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-[18px]" />
            </Button>
          )}
          <Breadcrumbs />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
