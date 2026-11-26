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
            "surface-overlay text-popover-foreground min-w-40 rounded-lg p-1 outline-none",
            // Expands from the button that opened it (`--transform-origin` comes from the positioner).
            "ease-fluid origin-(--transform-origin) transition-[opacity,scale] duration-(--motion-fast) data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
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
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-3 pl-8 text-sm transition-colors duration-(--motion-fast) outline-none select-none",
        "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground",
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

function DropdownMenuItem({ className, ...props }: Menu.Item.Props) {
  return (
    <Menu.Item
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-(--motion-fast) outline-none select-none",
        "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground data-[disabled]:opacity-50",
        "[&_svg]:text-muted-foreground [&_svg]:size-4",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("bg-border -mx-1 my-1 h-px", className)} {...props} />;
}

/** Non-interactive content at the top of a menu, such as who is signed in. */
function DropdownMenuHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2.5 pt-2 pb-2.5", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuHeader,
};
