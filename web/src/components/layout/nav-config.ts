import {
  Briefcase,
  FileCode2,
  LayoutGrid,
  Shapes,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Action } from "@/lib/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the signed-in role may perform this action. */
  requires?: Action;
  external?: boolean;
}

export interface NavSection {
  title: string;
  /** Only shown in development builds. */
  devOnly?: boolean;
  items: NavItem[];
}

/**
 * Primary navigation, organised around the recruiter's work. Only routes that exist are listed:
 * applications, a pipeline board and a review queue are planned (docs/scope.md) but have no pages
 * yet, so they are not shown. CV review lives inside a candidate, not in the navigation.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { title: "Overview", href: "/overview", icon: LayoutGrid },
      { title: "Jobs", href: "/jobs", icon: Briefcase },
      { title: "Candidates", href: "/candidates", icon: Users, requires: "candidate:read" },
    ],
  },
  {
    title: "Administration",
    items: [{ title: "Team", href: "/users", icon: UserCog, requires: "user:manage" }],
  },
  {
    title: "Developer",
    devOnly: true,
    items: [
      { title: "Components", href: "/dev/components", icon: Shapes },
      {
        title: "API reference",
        href: "http://localhost:8000/docs",
        icon: FileCode2,
        external: true,
      },
    ],
  },
];

/** Labels for path segments, used by the breadcrumbs. Ids and unknown segments are handled there. */
export const SEGMENT_LABELS: Record<string, string> = {
  overview: "Overview",
  jobs: "Jobs",
  new: "New job",
  edit: "Edit",
  candidates: "Candidates",
  review: "CV review",
  users: "Team",
  dev: "Developer",
  components: "Components",
};
