import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Compact labels. Status variants pair a soft tint with a text colour that passes 4.5:1, and every
 * badge carries a word, so meaning never rests on colour alone. Square-ish (6px), never pills.
 */
const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-1.5 rounded-sm border px-1.5 text-xs leading-none font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive-soft text-destructive",
        outline: "border-border-strong bg-transparent text-foreground",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        info: "border-transparent bg-info-soft text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** A small status dot to sit inside a badge, before its label. Decorative. */
function StatusDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full bg-current", className)}
    />
  );
}

export { Badge, StatusDot, badgeVariants };
