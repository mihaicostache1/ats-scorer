import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

const REPO = "https://github.com/mihaicostache1/ats-scorer";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Capabilities" },
      { href: "/#workflow", label: "Workflow" },
      { href: "/#review", label: "Candidate review" },
      { href: "/#transparency", label: "Transparency" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create an organization" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: REPO, label: "Source and documentation", external: true },
      {
        href: `${REPO}/blob/main/docs/privacy-ethics-checklist.md`,
        label: "Privacy and ethics checklist",
        external: true,
      },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-ink-800 bg-ink-950 border-t">
      <div className="mx-auto grid max-w-[1360px] gap-12 px-6 py-16 sm:px-10 lg:grid-cols-12 lg:px-16">
        <div className="lg:col-span-5">
          <Wordmark tone="outline" className="text-canvas" />
          <p className="text-mist mt-4 max-w-sm text-sm leading-relaxed">
            Structured CV review and explainable, job-specific matching. The system ranks and
            explains. People decide.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-eyebrow text-steel">{column.title}</h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-mist hover:text-canvas focus-visible:outline-cobalt-300 rounded-sm text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {link.label}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-mist hover:text-canvas focus-visible:outline-cobalt-300 rounded-sm text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-ink-800 border-t">
        <div className="text-steel mx-auto flex max-w-[1360px] flex-col justify-between gap-2 px-6 py-6 font-mono text-[11.5px] sm:flex-row sm:px-10 lg:px-16">
          <p>© {new Date().getFullYear()} ATS Scorer</p>
          <p>Examples on this site use invented data.</p>
        </div>
      </div>
    </footer>
  );
}
