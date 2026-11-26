import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Page not found" };

/** Any address that doesn't exist. Brand surface, two honest ways out. */
export default function NotFound() {
  return (
    <main className="bg-ink-950 text-canvas relative isolate flex min-h-screen flex-col [color-scheme:dark]">
      <div aria-hidden="true" className="ambient-ink absolute inset-0 -z-10" />
      <div aria-hidden="true" className="bg-blueprint mask-fade-y absolute inset-0 -z-10" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-6 sm:px-10 lg:px-16">
        <div className="flex h-16 items-center">
          <Link
            href="/"
            className="focus-visible:outline-cobalt-300 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
            aria-label="ATS Scorer home"
          >
            <Wordmark tone="outline" />
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-center pb-24">
          <p className="text-eyebrow text-mist flex items-center gap-3">
            <span className="text-cobalt-300">404</span>
            <span aria-hidden="true" className="text-ink-700">
              /
            </span>
            Not found
          </p>
          <h1 className="text-section mt-6 max-w-[16ch]">This page isn&apos;t here.</h1>
          <p className="text-mist mt-6 max-w-md leading-relaxed">
            The link may be out of date, or the page may have moved. Nothing you were working on has
            been changed.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/overview"
              className="bg-canvas text-ink-950 focus-visible:outline-cobalt-300 inline-flex h-11 items-center rounded-[10px] px-5 text-[15px] font-semibold transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-[3px]"
            >
              Go to your workspace
            </Link>
            <Link
              href="/"
              className="text-canvas hover:text-cobalt-300 focus-visible:outline-cobalt-300 rounded-md text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Back to the homepage
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
