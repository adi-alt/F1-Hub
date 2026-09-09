import Link from "next/link";
import { seasonHref } from "@/lib/routes";
// Not lib/supabase/archive.ts - Footer is imported directly by SmoothScroll.tsx's "use client"
// tree, so anything it imports gets bundled for the browser too; archive.ts drags in
// supabaseAdmin, archiveYears.ts is just the two plain year constants, safe either side.
import { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR } from "@/lib/archiveYears";

const EXPLORE_LINKS = [
  { href: seasonHref(2026), label: "2026 Season" },
  { href: "/circuits", label: "Circuits" },
  { href: "/archive", label: `Archive, ${ARCHIVE_EARLIEST_YEAR}-${ARCHIVE_LATEST_YEAR}` },
  { href: "/races/simulation", label: "Race simulator" },
];

export function Footer() {
  return (
    <footer
      className="relative bg-[var(--f1-carbon)]"
      // A taller band (400px, was 260px) with more intermediate stops so the curve itself eases
      // in and out instead of ramping at one constant rate - a straight two-stop ramp still reads
      // as a seam over any distance because the *rate* of change never softens near either end,
      // it just changes over more pixels. This is a linear (not radial) fade on purpose - the
      // footer's edge runs the full page width at a constant color, so a radial glow would fade
      // faster at the corners than the center and introduce the exact non-uniform look the
      // TreasureMapSection fade above just got fixed away from.
      style={{
        backgroundImage:
          "linear-gradient(to bottom, var(--background) 0%, color-mix(in srgb, var(--background) 85%, var(--f1-carbon)) 20%, color-mix(in srgb, var(--background) 40%, var(--f1-carbon)) 55%, var(--f1-carbon) 100%)",
        backgroundSize: "100% 400px",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Same idea as the hero's own post-band fade strip, reversed - that one starts strong right
          at its seam and eases to transparent moving away from it (into the content below); this
          one starts transparent (blending into whatever content precedes the footer) and eases to
          a warm brown right at its own seam (the footer's top edge) - matching the site's existing
          warm glow accent (the same rgba(225,90,40,...) tone TreasureMapSection's own atmosphere
          uses), not a grey. Positioned with bottom-full so it extends upward, overlapping the last
          10vh of whatever comes right before the footer, rather than living inside the footer's
          own (clipped) box. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-[10vh] bg-gradient-to-b from-transparent to-[#3a2418]" />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
              <span className="inline-block h-5 w-1.5 rounded-full bg-[var(--f1-red)]" />
              F1 HUB
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              Predictions, a race simulator, and a full historical archive back to 1950. Built for
              anyone following the sport, whichever part of it they follow.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-neutral-400 transition hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--f1-line)] pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} F1 Hub. Not affiliated with Formula 1 or the FIA.</p>
          <p>Predictions are a model&apos;s best estimate, not a promise of what happens on Sunday.</p>
        </div>
      </div>
    </footer>
  );
}
