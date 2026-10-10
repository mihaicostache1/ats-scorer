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
            "border-input bg-background focus-visible:ring-ring focus-visible:border-ring flex h-9 w-full appearance-none rounded-md border px-3 py-1 pr-8 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive/30",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 opacity-50" />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
