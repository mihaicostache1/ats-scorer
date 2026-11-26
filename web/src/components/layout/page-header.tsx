import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** A small link to the parent page. Its visible text is short; its accessible name says "Back to…". */
export function BackLink({
  href,
  label,
  text,
  className,
}: {
  href: string;
  label: string;
  text: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex max-w-full items-center gap-1.5 rounded-sm text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
    >
      <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </Link>
  );
}

/**
 * The one page-header pattern: title, an optional line of context, one primary action (plus
 * secondary ones) on the right, and optional tabs or filters underneath.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  children,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A small label above the title, e.g. a status or the parent object. */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  /** A row of facts under the title (badges, dates). */
  meta?: React.ReactNode;
  /** Tabs or a toolbar that belong to the header. */
  children?: React.ReactNode;
  /** The parent page. Shown as a small link above the title; its accessible name is `label`. */
  back?: { href: string; label: string; text: string };
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {back && <BackLink {...back} className="-mb-2" />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && <div className="text-muted-foreground text-eyebrow-sm">{eyebrow}</div>}
          <h1 className="text-foreground text-large-title break-words">{title}</h1>
          {description && (
            <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
              {description}
            </p>
          )}
          {meta && <div className="flex flex-wrap items-center gap-2 pt-1.5">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** A section heading inside a page: smaller title, optional action on the right. */
export function SectionHeader({
  title,
  description,
  action,
  id,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-foreground text-title-3">
          {title}
        </h2>
        {description && <p className="text-muted-foreground mt-0.5 text-[13px]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
