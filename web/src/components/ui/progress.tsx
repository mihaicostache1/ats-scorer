import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** 0 to 100. */
  value: number;
  /** Names the bar for assistive technology. */
  label: string;
}

/** A determinate progress bar. Not a live region: announce milestones separately, not every tick. */
export function Progress({ value, label, className, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("bg-muted h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-200"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
