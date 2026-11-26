import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

/**
 * The public website. It has a fixed brand appearance (Ink navy with light editorial
 * sections) that does not follow the workspace theme setting, and it needs no session or API.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink-950 text-canvas flex min-h-screen flex-col [color-scheme:dark]">
      <a
        href="#main"
        className="bg-canvas text-ink-950 sr-only z-[60] rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
