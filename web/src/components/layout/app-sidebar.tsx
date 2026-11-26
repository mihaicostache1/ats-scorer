"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { useSession } from "@/providers/session-provider";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, type NavItem } from "./nav-config";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const className = cn(
    "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors duration-(--motion-fast)",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    collapsed && "justify-center px-0",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[var(--glass-highlight),0_0_0_1px_var(--sidebar-border),0_1px_2px_rgb(10_16_34/0.04)] before:bg-electric before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full"
      : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
  );
  const content = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          active ? "text-electric" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.title}</span>
      {item.external && !collapsed && (
        <ArrowUpRight aria-hidden="true" className="text-muted-foreground ml-auto size-3.5" />
      )}
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={collapsed ? item.title : undefined}
        onClick={onClick}
      >
        {content}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link
      href={item.href}
      className={className}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.title : undefined}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}

/**
 * Workspace navigation. Light and quiet in the default appearance, deep navy in the dark one.
 * On desktop it can collapse to an icon rail; the choice is remembered.
 */
export function AppSidebar({
  className,
  onItemClick,
  collapsed = false,
  onToggleCollapsed,
}: {
  className?: string;
  onItemClick?: () => void;
  collapsed?: boolean;
  /** Present on desktop only; the mobile slide-over has no collapsed state. */
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const { can, user } = useSession();
  const sections = NAV_SECTIONS.filter(
    (section) => !section.devOnly || process.env.NODE_ENV === "development"
  )
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.requires || can(item.requires)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        "glass-bar flex flex-col border-r border-(--glass-border) transition-[width] duration-(--motion-base) ease-(--ease-fluid)",
        collapsed ? "w-[60px]" : "w-60",
        className
      )}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "px-4")}>
        <Link
          href="/overview"
          onClick={onItemClick}
          className="focus-visible:ring-ring flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          aria-label="ATS Scorer, go to overview"
        >
          <LogoMark className="size-7" />
          {!collapsed && (
            <span className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">
              ATS Scorer
            </span>
          )}
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 pt-3 pb-4">
        {sections.map((section) => (
          <div key={section.title}>
            <h2
              className={cn(
                "text-muted-foreground text-eyebrow-sm mb-2 px-2",
                collapsed && "sr-only"
              )}
            >
              {section.title}
            </h2>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={!item.external && isActive(pathname, item.href)}
                    collapsed={collapsed}
                    onClick={onItemClick}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "border-sidebar-border flex items-center gap-2 border-t py-3",
          collapsed ? "flex-col px-2" : "px-4"
        )}
      >
        {!collapsed && user && (
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            Signed in as <span className="text-foreground capitalize">{user.role}</span>
          </p>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
