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
import { cn } from "@/lib/utils";

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

const sections: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard },
      { title: "Job Openings", href: "/#jobs", icon: Briefcase, badge: "20" },
      { title: "Candidates", href: "/#candidates", icon: Users, badge: "48" },
      { title: "Pipeline Stages", href: "/#pipeline", icon: Layers },
    ],
  },
  {
    title: "Compliance & AI",
    items: [
      { title: "Audit Trail", href: "/#audit", icon: ShieldAlert },
      { title: "Consent Records", href: "/#consent", icon: FileCheck2 },
      { title: "Vector Embeddings", href: "/#vectors", icon: Database },
    ],
  },
  {
    title: "Developer Tools",
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

  return (
    <aside
      className={cn(
        "border-border bg-card/60 flex w-64 flex-col border-r backdrop-blur-xs",
        className
      )}
      aria-label="Sidebar navigation"
    >
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <h4 className="text-muted-foreground/80 px-3 text-[11px] font-semibold tracking-wider uppercase">
              {section.title}
            </h4>
            <div className="space-y-0.5 pt-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isExternal = item.href.startsWith("http");
                const isActive = pathname === item.href;

                const content = (
                  <div
                    className={cn(
                      "group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-transform group-hover:scale-105",
                          isActive ? "text-primary-foreground" : "text-muted-foreground"
                        )}
                      />
                      <span>{item.title}</span>
                    </div>

                    {item.badge && (
                      <Badge
                        variant={isActive ? "secondary" : "outline"}
                        className={cn(
                          "h-4.5 px-1.5 py-0 text-[10px] font-normal",
                          isActive &&
                            "bg-primary-foreground/20 text-primary-foreground border-transparent"
                        )}
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
                      className="focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
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
                    className="focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
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
      <div className="border-border bg-muted/40 m-2 rounded-xl border-t p-3">
        <div className="flex items-center justify-between">
          <div className="text-foreground text-[11px] font-medium">
            Environment:{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Dev</span>
          </div>
          <div className="size-2 animate-pulse rounded-full bg-emerald-500" />
        </div>
        <p className="text-muted-foreground mt-1 text-[10px]">Connected to PostgreSQL & Redis</p>
      </div>
    </aside>
  );
}
