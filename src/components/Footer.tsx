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
      className="bg-[var(--f1-carbon)]"
      // A single 100px linear stop reads as a visible seam where the page's flat background
      // suddenly starts turning into the footer's carbon tone - more stops across a taller band
      // (with an eased midpoint, not a straight ramp) blends the two the way the homepage's own
      // hero-to-background fade already does (see HomeLayout.tsx's gradient).
      style={{
        backgroundImage:
          "linear-gradient(to bottom, var(--background) 0%, color-mix(in srgb, var(--background) 60%, var(--f1-carbon)) 45%, var(--f1-carbon) 100%)",
        backgroundSize: "100% 260px",
        backgroundRepeat: "no-repeat",
      }}
    >
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
