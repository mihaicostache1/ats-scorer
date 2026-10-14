"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Briefcase, LogOut, Menu, Shield, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Action } from "@/lib/permissions";
import { useSession } from "@/providers/session-provider";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /** Hidden unless the signed-in role may perform this action. */
  requires?: Action;
  /** Only shown in development builds. */
  devOnly?: boolean;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: Briefcase },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Candidates", href: "/#candidates", icon: Users },
  { label: "Audit Logs", href: "/#audit", icon: Shield, requires: "audit:read" },
  { label: "Design System", href: "/dev/components", icon: Sparkles, badge: "UI", devOnly: true },
];

export function AppHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const pathname = usePathname();
  const { user, can, signOut } = useSession();
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.requires || can(item.requires)) &&
      (!item.devOnly || process.env.NODE_ENV === "development")
  );
  const initials = (user?.full_name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="border-border bg-background/95 sticky top-0 z-40 w-full border-b backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              className="lg:hidden"
              aria-label="Toggle navigation menu"
            >
              <Menu className="size-4" />
            </Button>
          )}

          <Link
            href="/"
            className="text-foreground focus-visible:ring-ring flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-xs font-bold shadow-xs">
              ATS
            </div>
            <span className="hidden font-bold sm:inline-block">ATS Scorer</span>
          </Link>

          <span className="hidden items-center md:inline-flex">
            <Badge variant="secondary" className="h-4.5 px-1.5 py-0 text-[10px] font-normal">
              v0.1.0
            </Badge>
          </span>
        </div>

        {/* Desktop Header Nav Links */}
        <nav className="hidden items-center space-x-1 md:flex" aria-label="Main Navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "focus-visible:ring-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="size-3.5" />
                {item.label}
                {item.badge && (
                  <Badge variant="outline" className="ml-0.5 h-4 px-1 py-0 text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right header actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Notifications"
            className="text-muted-foreground hover:text-foreground"
          >
            <Bell className="size-4" />
          </Button>

          <div className="border-border hidden items-center gap-2 border-l pl-2 sm:flex">
            <div
              className="bg-primary/10 text-primary border-border flex size-7 items-center justify-center rounded-full border text-xs font-medium"
              aria-hidden="true"
            >
              {initials || "?"}
            </div>
            <div className="hidden text-left lg:block">
              <div className="flex items-center gap-1.5 text-xs leading-none font-semibold">
                {user?.full_name}
                <Badge variant="outline" className="h-4 px-1 py-0 text-[10px] capitalize">
                  {user?.role}
                </Badge>
              </div>
              <div className="text-muted-foreground text-[10px]">{user?.email}</div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>

          {/* Mobile hamburger menu */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer / dropdown */}
      {mobileMenuOpen && (
        <div className="border-border bg-background animate-in slide-in-from-top-2 space-y-1 border-t px-4 py-3 shadow-lg md:hidden">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  {item.label}
                </div>
                {item.badge && (
                  <Badge variant="outline" className="px-1 py-0 text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
