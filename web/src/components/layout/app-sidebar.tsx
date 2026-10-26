"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Database,
  FileCheck2,
  FileCode2,
  Layers,
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Action } from "@/lib/permissions";
import { useSession } from "@/providers/session-provider";
import { cn } from "@/lib/utils";

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /** Hidden unless the signed-in role may perform this action. */
  requires?: Action;
}

interface SidebarSection {
  title: string;
  /** Only shown in development builds. */
  devOnly?: boolean;
  items: SidebarItem[];
}

const sections: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard },
      { title: "Job Openings", href: "/jobs", icon: Briefcase },
      { title: "Candidates", href: "/candidates", icon: Users, requires: "candidate:read" },
      { title: "Pipeline Stages", href: "/#pipeline", icon: Layers },
    ],
  },
  {
    title: "Compliance & AI",
    items: [
      { title: "Audit Trail", href: "/#audit", icon: ShieldAlert, requires: "audit:read" },
      { title: "Consent Records", href: "/#consent", icon: FileCheck2 },
      { title: "Vector Embeddings", href: "/#vectors", icon: Database },
    ],
  },
  {
    title: "Developer Tools",
    devOnly: true,
    items: [
      {
        title: "Component Library",
        href: "/dev/components",
        icon: Sparkles,
        badge: "Showcase",
      },
      {
        title: "API Docs (FastAPI)",
        href: "http://localhost:8000/docs",
        icon: FileCode2,
      },
    ],
  },
];

export function AppSidebar({
  className,
  onItemClick,
}: {
  className?: string;
  onItemClick?: () => void;
}) {
  const pathname = usePathname();
  const { can } = useSession();
  const visibleSections = sections
    .filter((section) => !section.devOnly || process.env.NODE_ENV === "development")
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.requires || can(item.requires)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn("glass-side flex w-64 flex-col", className)}
      aria-label="Sidebar navigation"
    >
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {visibleSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <h4 className="text-muted-foreground text-footnote px-3 font-semibold">
              {section.title}
            </h4>
            <div className="space-y-0.5 pt-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isExternal = item.href.startsWith("http");
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                const content = (
                  <div
                    className={cn(
                      "group flex min-h-10 items-center justify-between rounded-[10px] px-3 py-2 text-[15px] font-medium transition-all duration-200 ease-out",
                      isActive
                        ? "glass-subtle text-sidebar-accent-foreground ring-primary/25 font-semibold ring-1"
                        : "text-sidebar-foreground hover:bg-foreground/5 active:scale-[0.99]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          "size-[18px] shrink-0",
                          isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground"
                        )}
                      />
                      <span>{item.title}</span>
                    </div>

                    {item.badge && (
                      <Badge
                        variant={isActive ? "default" : "secondary"}
                        className="px-2 py-0 text-xs font-medium"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                );

                if (isExternal) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-visible:ring-primary/25 block rounded-[10px] focus-visible:ring-4 focus-visible:outline-none"
                      onClick={onItemClick}
                    >
                      {content}
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="focus-visible:ring-primary/25 block rounded-[10px] focus-visible:ring-4 focus-visible:outline-none"
                    onClick={onItemClick}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer info box */}
      <div className="glass-subtle m-3 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="text-foreground text-footnote font-medium">
            Environment: <span className="text-success font-semibold">Dev</span>
          </div>
          <div className="bg-success size-2 animate-pulse rounded-full" />
        </div>
        <p className="text-muted-foreground text-caption mt-1">Connected to PostgreSQL & Redis</p>
      </div>
    </aside>
  );
}
