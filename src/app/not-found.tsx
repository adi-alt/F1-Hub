import type { Metadata } from "next";
import Link from "next/link";
import { seasonHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Page Not Found" };

// An 8x2 checkered-flag strip, drawn once and reused for the top/bottom accent - real racing
// motif, not just a red glow, and cheap enough as plain divs that it doesn't need an SVG/image.
function CheckeredStrip() {
  return (
    <div className="mx-auto flex h-3 w-32 overflow-hidden rounded-full opacity-40">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className={(Math.floor(i / 2) + (i % 2)) % 2 === 0 ? "flex-1 bg-white" : "flex-1 bg-black"} />
      ))}
    </div>
  );
}

/** The route-not-found boundary (Next's own not-found.tsx convention) - AmbientBackground and the
 * header/footer chrome from the root layout are still around this, only the page body is
 * replaced, same scoping as error.tsx's own render-error boundary. */
export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <CheckeredStrip />
        <p className="mt-8 font-mono text-7xl font-bold tracking-tight text-white sm:text-8xl">
          <span className="text-[var(--f1-red)]">4</span>0<span className="text-[var(--f1-red)]">4</span>
        </p>
        <h1 className="mt-4 text-xl font-bold text-white">Off track.</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This page doesn&apos;t exist — wrong URL, or something that moved. Let&apos;s get you back on the racing line.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="rounded-lg bg-[var(--f1-red)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">
            Back to F1 Hub
          </Link>
          <Link
            href={seasonHref(2026)}
            className="rounded-lg border border-[var(--f1-line)] px-5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:border-white/30"
          >
            View the season
          </Link>
        </div>
        <div className="mt-8">
          <CheckeredStrip />
        </div>
      </div>
    </div>
  );
}
