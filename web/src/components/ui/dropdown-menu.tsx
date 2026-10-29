"use client";

import * as React from "react";
import { Menu } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small menu built on base-ui. Arrow keys move between items, Enter or Space picks one, Esc
 * closes, and focus goes back to the button that opened it.
 */

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;
const DropdownMenuRadioGroup = Menu.RadioGroup;

function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  children,
  ...props
}: Menu.Popup.Props & { align?: "start" | "center" | "end"; sideOffset?: number }) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={sideOffset} className="z-50">
        <Menu.Popup
          className={cn(
            "glass-strong text-popover-foreground min-w-40 rounded-xl p-1.5 outline-none",
            className
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuRadioItem({ className, children, ...props }: Menu.RadioItem.Props) {
  return (
    <Menu.RadioItem
      // base-ui leaves the menu open after a radio pick; a one-choice menu should close.
      closeOnClick
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-lg py-2 pr-3 pl-8 text-[15px] transition-colors duration-200 outline-none select-none",
        "data-[highlighted]:bg-foreground/10 data-[highlighted]:text-foreground",
        className
      )}
      {...props}
    >
      <Menu.RadioItemIndicator className="absolute left-2 flex items-center">
        <Check className="size-4" aria-hidden="true" />
      </Menu.RadioItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
