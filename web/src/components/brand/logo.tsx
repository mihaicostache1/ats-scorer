import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The ATS Scorer mark: a document tile holding three left-aligned lines, the structured fields
 * extracted from a CV. The middle line stops short and ends in a single Cobalt point: the detail a
 * person has looked at and confirmed. Document structure, alignment, extraction, human review.
 *
 * Built on a 32-unit grid so it stays crisp at 16px (favicon), 24px (collapsed sidebar) and larger.
 */
export function LogoMark({
  className,
  tone = "navy",
  title,
}: {
  className?: string;
  /** `navy`: dark tile, for light backgrounds. `outline`: hairline tile, for navy backgrounds. */
  tone?: "navy" | "outline";
  /** Give a title only when the mark stands alone as a link or image; otherwise it is decorative. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        className={
          tone === "navy"
            ? "fill-ink-950 stroke-ink-950 dark:fill-ink-900 dark:stroke-ink-700"
            : "fill-ink-900 stroke-ink-700"
        }
      />
      <rect x="8" y="8.5" width="16" height="3" rx="1.5" fill="#F5F6F9" />
      <rect x="8" y="14.5" width="9" height="3" rx="1.5" fill="#F5F6F9" />
      <rect x="20" y="14.5" width="3" height="3" rx="0.75" fill="#7C96FF" />
      <rect x="8" y="20.5" width="12.5" height="3" rx="1.5" fill="#9AA5BF" />
    </svg>
  );
}

/** Mark plus the product name. The name is real text, so it reads and scales with the page. */
export function Wordmark({
  className,
  tone = "navy",
  markClassName,
}: {
  className?: string;
  tone?: "navy" | "outline";
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} className={markClassName} />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">ATS Scorer</span>
    </span>
  );
}
