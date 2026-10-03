import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono } from "next/font/google";
import { AmbientBackground } from "@/components/AmbientBackground";
import { AuthDialogHost } from "@/components/auth/AuthDialogHost";
import { Header } from "@/components/Header";
import { getCurrentSeason } from "@/lib/currentSeason";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { ApexLauncher } from "@/components/apex/ApexLauncher";
import { ApexScopeProvider } from "@/components/apex/ApexScopeProvider";
import { AppProviders } from "@/providers/AppProviders";
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
  // No year in it: it is cached and shared, and a hard-coded season goes stale on 1 January.
  title: { template: "%s | F1 Hub", default: "F1 Hub: Race Predictions" },
  description: "Race results, track history, and ML-driven predictions for the current F1 season.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The season the nav and footer link to, from the calendar (lib/currentSeason.ts; audit R-22).
  const season = await getCurrentSeason();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        {/* The first Tab stop on every page (WCAG 2.4.1): past the header and its nav, into the
            content. Hidden until focused; the target is SmoothScroll's <main id="main">. */}
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-3 focus-visible:z-toast focus-visible:rounded-control focus-visible:bg-surface-3 focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-body-sm focus-visible:font-medium focus-visible:text-primary focus-visible:shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Skip to content
        </a>
        <AmbientBackground />
        <AppProviders>
          {/* Apex is app-wide now rather than a homepage widget. The provider holds whatever scope
              the current page registered; the launcher renders nothing at all on a page that
              registered none, so it never offers to answer questions about a page it can't see. */}
          <ApexScopeProvider>
            <Header season={season} />
            <SmoothScroll season={season}>{children}</SmoothScroll>
            <ApexLauncher />
          </ApexScopeProvider>
          <AuthDialogHost />
        </AppProviders>
        {/* Zero-config, no dashboard setup needed beyond having the packages installed on a
            Vercel-hosted project — the closest thing to "monitoring" this app has today (see
            error.tsx's own note: no dedicated error-tracking service is wired up yet). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
