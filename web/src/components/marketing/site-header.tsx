"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** Only destinations that exist: sections of this page, sign in and registration. */
const NAV = [
  { href: "#product", label: "Product" },
  { href: "#workflow", label: "Workflow" },
  { href: "#review", label: "Candidate review" },
  { href: "#transparency", label: "Transparency" },
] as const;

const linkClass =
  "rounded-md px-3 py-2 text-[14px] text-mist transition-colors duration-(--motion-fast) hover:text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-300";

/**
 * Sticky marketing navigation. Transparent over the hero; once the page scrolls it gains a solid
 * navy fill and a hairline, so it never floats over content without contrast.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const menuId = React.useId();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-(--motion-base)",
        scrolled || open ? "glass-bar-ink border-ink-700/70" : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-6 px-6 sm:px-10 lg:px-16">
        <Link
          href="/"
          className="text-canvas focus-visible:outline-cobalt-300 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
          aria-label="ATS Scorer home"
        >
          <Wordmark tone="outline" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={linkClass}>
            Sign in
          </Link>
          <Link
            href="/register"
            className="bg-inverse text-inverse-foreground hover:bg-inverse-hover glow-on-ink focus-visible:outline-cobalt-300 inline-flex h-9 items-center rounded-lg px-4 text-[14px] font-semibold transition-[background-color,box-shadow] duration-(--motion-base) ease-(--ease-fluid) focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="text-canvas focus-visible:outline-cobalt-300 -mr-2 inline-flex size-10 items-center justify-center rounded-md focus-visible:outline-2 md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id={menuId} className="border-ink-700/70 border-t md:hidden">
          <nav aria-label="Main" className="flex flex-col px-6 py-4 sm:px-10">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-canvas border-ink-800 border-b py-3.5 text-base"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link
                href="/login"
                className="border-ink-700 text-canvas inline-flex h-11 items-center justify-center rounded-lg border text-[15px] font-medium"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="bg-inverse text-inverse-foreground hover:bg-inverse-hover glow-on-ink inline-flex h-11 items-center justify-center rounded-lg text-[15px] font-semibold transition-[background-color,box-shadow] duration-(--motion-base) ease-(--ease-fluid)"
              >
                Get started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
