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
        "peer border-muted-foreground/40 bg-background inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-all duration-200 ease-out outline-none",
        "focus-visible:ring-primary/25 focus-visible:ring-4",
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
