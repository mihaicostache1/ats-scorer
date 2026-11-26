import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "control text-foreground placeholder:text-muted-foreground/80 focus-visible:border-electric focus-visible:ring-electric/20 aria-invalid:border-destructive disabled:bg-disabled disabled:text-disabled-foreground flex h-9 w-full rounded-lg px-3 py-1 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed",
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
Input.displayName = "Input";

export { Input };
