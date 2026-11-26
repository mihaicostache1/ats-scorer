import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";

// Geist Sans for everything people read; Geist Mono only for scores, identifiers and small labels.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ATS Scorer — See the talent beyond the résumé",
    template: "%s · ATS Scorer",
  },
  description:
    "ATS Scorer turns CVs into structured, reviewable candidate profiles and explains every job-specific match score, so recruiters make the decision with more context.",
  applicationName: "ATS Scorer",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F6F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1022" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script below sets the theme class on <html> before React loads.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before the first paint, so there is no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
