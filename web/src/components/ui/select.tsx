import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            "control text-foreground focus-visible:border-electric focus-visible:ring-electric/20 aria-invalid:border-destructive disabled:bg-disabled disabled:text-disabled-foreground flex h-9 w-full appearance-none rounded-lg px-3 py-1 pr-9 text-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed",
            error &&
              "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="text-muted-foreground pointer-events-none absolute top-2.5 right-2.5 size-4" />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
