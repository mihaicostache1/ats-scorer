"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<SwitchPrimitive.Root.Props, "className"> {
  className?: string;
}

const Switch = React.forwardRef<HTMLElement, SwitchProps>(({ className, ...props }, ref) => {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 ease-out outline-none",
        "focus-visible:ring-primary/25 focus-visible:ring-4",
        "data-checked:bg-success bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2),0_1px_1px_rgb(0_0_0/0.12)] ring-0 transition-transform duration-200 ease-out",
          "translate-x-0 data-checked:translate-x-5"
        )}
      />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = "Switch";

export { Switch };
