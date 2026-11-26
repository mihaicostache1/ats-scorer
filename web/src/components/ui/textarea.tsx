import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "control text-foreground placeholder:text-muted-foreground/80 focus-visible:border-electric focus-visible:ring-electric/20 aria-invalid:border-destructive disabled:bg-disabled disabled:text-disabled-foreground flex min-h-[88px] w-full rounded-lg px-3 py-2 text-sm leading-relaxed focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed",
          error &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
          className
        )}
        ref={ref}
        aria-invalid={error ? "true" : undefined}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
