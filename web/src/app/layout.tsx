import type { Metadata } from "next";
import { themeInitScript } from "@/lib/theme";
import { MockProvider } from "@/providers/mock-provider";
import { SessionProvider } from "@/providers/session-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATS Scorer",
  description: "AI-Assisted Applicant Tracking System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script below sets the theme class on <html> before React loads.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Runs before the first paint, so there is no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <MockProvider>
            <SessionProvider>{children}</SessionProvider>
          </MockProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
