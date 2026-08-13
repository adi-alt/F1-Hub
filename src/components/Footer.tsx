import Link from "next/link";
import { seasonHref } from "@/lib/routes";

const EXPLORE_LINKS = [
  { href: seasonHref(2026), label: "2026 Season" },
  { href: "/circuits", label: "Circuits" },
  { href: "/archive", label: "Archive, 1950-2017" },
  { href: "/races/simulation", label: "Race simulator" },
];

export function Footer() {
  return (
    <footer className="bg-[var(--background)]">
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
