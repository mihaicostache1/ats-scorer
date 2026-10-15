import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MockProvider } from "@/providers/mock-provider";
import { SessionProvider } from "@/providers/session-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATS Scorer",
  description: "AI-Assisted Applicant Tracking System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <MockProvider>
          <SessionProvider>{children}</SessionProvider>
        </MockProvider>
      </body>
    </html>
  );
}
