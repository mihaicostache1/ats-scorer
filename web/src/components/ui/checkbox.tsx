"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<CheckboxPrimitive.Root.Props, "className"> {
  className?: string;
}

const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer border-input bg-background inline-flex size-4 shrink-0 items-center justify-center rounded-sm border shadow-xs transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2",
        "data-checked:bg-primary data-checked:text-primary-foreground data-checked:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3 stroke-[3]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
