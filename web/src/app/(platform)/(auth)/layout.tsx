import { Suspense } from "react";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Sign in, registration and invitations. On desktop, an Ink navy editorial panel sits beside a
 * focused light form; on mobile the panel drops away and only the form remains.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen">
      <aside
        aria-hidden="true"
        className="bg-ink-950 text-canvas relative isolate hidden w-[44%] max-w-[680px] shrink-0 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16"
      >
        <div className="ambient-ink absolute inset-0 -z-10" />
        <div className="bg-blueprint mask-fade-y absolute inset-0 -z-10" />
        <Link href="/" tabIndex={-1} className="text-canvas w-fit">
          <Wordmark tone="outline" />
        </Link>

        <div>
          <p className="text-eyebrow text-mist flex items-center gap-3">
            <span className="bg-cobalt-300 size-1.5" />
            The system ranks and explains
          </p>
          <p className="mt-6 text-[clamp(2.5rem,1.2rem+2.6vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.04em]">
            People
            <br />
            <span className="text-cobalt-300">decide</span>.
          </p>
          <p className="text-mist mt-6 max-w-sm leading-relaxed">
            Structured CV review and job-specific match scores, with every component shown and every
            decision left to your team.
          </p>
        </div>

        <ul className="border-ink-700 text-steel grid grid-cols-3 gap-4 border-t pt-6 font-mono text-[11.5px]">
          <li>01 Upload</li>
          <li>02 Understand</li>
          <li>03 Review</li>
        </ul>
      </aside>

      <div className="relative flex min-h-screen flex-1 flex-col">
        <div className="flex h-16 items-center justify-between px-6 sm:px-10">
          <Link
            href="/"
            className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none lg:invisible"
            aria-label="ATS Scorer home"
          >
            <LogoMark className="size-7" />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pt-4 pb-16 sm:px-10">
          {/* Pages read `?next=` through useSearchParams, which needs a Suspense boundary. */}
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
    </div>
  );
}
