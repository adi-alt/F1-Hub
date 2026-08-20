import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthDialogHost } from "@/components/auth/AuthDialogHost";
import { Header } from "@/components/Header";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
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
  title: "F1 Hub: 2026 Predictions",
  description: "Race results, track history, and ML-driven predictions for the 2026 F1 season.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <AppProviders>
          <Header />
          <SmoothScroll>{children}</SmoothScroll>
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
