import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Buttons. `default` is the Cobalt action (#2F55E4 with a white label on light, #7C96FF with an Ink
 * label on dark) and picks up a soft Cobalt glow on hover. `inverse` is the crisp white action with
 * an Ink label, for the one main call to action on an Ink surface. Feedback is a colour change, a
 * glow and a 1px press: no scaling.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border font-medium whitespace-nowrap select-none outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-(--motion-fast) ease-(--ease-standard) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-(--glow) active:bg-primary-pressed",
        inverse:
          "border-transparent bg-inverse text-inverse-foreground hover:bg-inverse-hover glow-on-ink font-semibold",
        outline:
          "control text-foreground hover:bg-secondary aria-expanded:bg-secondary aria-expanded:text-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-border aria-expanded:bg-border",
        ghost:
          "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground",
        destructive:
          "border-transparent bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive dark:text-ink-950",
        "destructive-outline":
          "border-destructive/40 bg-transparent text-destructive hover:bg-destructive-soft focus-visible:ring-destructive",
        link: "h-auto border-transparent px-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-[15px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xl: "h-12 gap-2.5 rounded-[10px] px-6 text-base",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
