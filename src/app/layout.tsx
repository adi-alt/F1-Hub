import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthDialogHost } from "@/components/auth/AuthDialogHost";
import { Header } from "@/components/Header";
import { getCurrentSeason } from "@/lib/currentSeason";
import { PageFrame } from "@/components/PageFrame";
import { ScrollMemory } from "@/components/ScrollMemory";
import { ApexLauncher } from "@/components/apex/ApexLauncher";
import { SectionNav } from "@/components/SectionNav";
import { ApexScopeProvider } from "@/components/apex/ApexScopeProvider";
import { AppProviders } from "@/providers/AppProviders";
import type { InitialAuth } from "@/providers/AuthProvider";
import { getSession } from "@/lib/session/getSession";
import { getHeaderSessions } from "@/lib/supabase/headerSessions";
import { SHARE_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const HOME_TITLE = `${SITE_NAME}: live F1 results, predictions and every race since 1950`;

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  // No year in it: it is cached and shared, and a hard-coded season goes stale on 1 January.
  title: { template: `%s | ${SITE_NAME}`, default: HOME_TITLE },
  description: SITE_DESCRIPTION,
  // The home page's card, and every page's that doesn't set its own (each page does, through lib/seo.ts).
  openGraph: { type: "website", siteName: SITE_NAME, title: HOME_TITLE, description: SITE_DESCRIPTION, url: "/", locale: "en_GB", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: SITE_DESCRIPTION, images: [SHARE_IMAGE] },
};

// The app's colour for the browser's own UI (the address bar on a phone).
export const viewport: Viewport = { themeColor: "#0b0b0d" };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The season the nav and footer link to, from the calendar (lib/currentSeason.ts; audit R-22).
  const season = await getCurrentSeason();
  // Who this request belongs to, read from the session cookie (no database call), so the header, the nav and the
  // footer render for a signed-in or a signed-out visitor from the first paint instead of a placeholder that
  // swaps once /api/auth/me answers. Display only: every permission is still checked where it's used.
  const session = await getSession();
  // The header's race-weekend status: the next few sessions from the cached calendar.
  const sessions = await getHeaderSessions(season);
  const initialAuth: InitialAuth = session.uid
    ? { uid: session.uid, email: session.email ?? null, photoURL: session.photoURL ?? null, role: session.role ?? "user", displayName: session.displayName ?? null }
    : null;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      {/* The document scrolls (audit R-31): no fixed-height body and no inner scroll container, so the
          browser's own scrollbar, find-in-page, keyboard scrolling and Back-button scroll restoration all
          work. The header is sticky; see Header.tsx. */}
      <body className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
        {/* The first Tab stop on every page (WCAG 2.4.1): past the header and its nav, into the
            content. Hidden until focused; the target is PageFrame's <main id="main">. */}
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-3 focus-visible:z-toast focus-visible:rounded-control focus-visible:bg-surface-3 focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-body-sm focus-visible:font-medium focus-visible:text-primary focus-visible:shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Skip to content
        </a>
        <ScrollMemory />
        <AppProviders initialAuth={initialAuth}>
          {/* Apex is app-wide now rather than a homepage widget. The provider holds whatever scope
              the current page registered; the launcher renders nothing at all on a page that
              registered none, so it never offers to answer questions about a page it can't see. */}
          <ApexScopeProvider>
            <Header season={season} sessions={sessions} />
            <PageFrame season={season}>{children}</PageFrame>
            <ApexLauncher />
            <SectionNav />
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
