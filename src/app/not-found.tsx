import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Flag, Home, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MiniWindow } from "@/components/home/landing/MiniWindow";
import { CircuitMini } from "@/components/home/landing/FeatureShowcase";
import { getCurrentSeason } from "@/lib/currentSeason";
import { seasonHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The route-not-found page (Next's not-found.tsx), in the same language as the sign-in gate: what happened, a clear way
 * back, a floating window with a car still lapping its circuit ("Lap 404"), and the main sections to go to next. The
 * header and footer from the root layout stay around it.
 */
export default async function NotFound() {
  const season = await getCurrentSeason();
  const next = [
    { href: seasonHref(season), icon: Flag, title: `${season} season`, text: "Standings, races and the title fight" },
    { href: "/circuits", icon: MapPin, title: "Circuits", text: "Every track on the calendar" },
    { href: "/archive", icon: Archive, title: "Archive", text: "Every race since 1950" },
    { href: "/", icon: Home, title: "Home", text: "The next race and the latest" },
  ];

  return (
    <div className="page-content isolate overflow-x-clip py-10 lg:py-16">
      <section className="grid grid-cols-1 items-center gap-10 lg:min-h-[24rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div className="min-w-0">
          <p className="text-body-sm text-secondary">
            <span className="tabular font-semibold text-brand-text">404</span> · Page not found
          </p>
          <h1 className="mt-1 text-display-md font-semibold text-primary">This page went off the track.</h1>
          <p className="mt-3 max-w-xl text-body text-secondary">
            The address may be mistyped, or the page has moved. Everything else is still running: pick up from one of the
            sections below.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" asChild>
              <Link href="/">Back to the home page</Link>
            </Button>
            <Button variant="ghost" size="md" asChild>
              <Link href={seasonHref(season)}>See the {season} season</Link>
            </Button>
          </div>
        </div>
        <div aria-hidden className="relative mx-auto w-full max-w-sm">
          <span className="absolute inset-6 -z-10 rounded-full bg-brand/10 blur-3xl" />
          <MiniWindow title="Lap 404" float={{ x: 4, y: 14, dur: 9, delay: 0 }}>
            <CircuitMini />
          </MiniWindow>
        </div>
      </section>

      <section aria-labelledby="next-heading" className="mt-14 border-t border-subtle pt-8">
        <h2 id="next-heading" className="text-body font-semibold text-primary">
          Where to next?
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {next.map((n) => (
            <li key={n.title}>
              <Link href={n.href} className="group flex h-full items-start gap-3 rounded-card bg-surface-1 p-4 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
                <n.icon aria-hidden size={20} className="mt-0.5 shrink-0 text-secondary transition-colors group-hover:text-brand-text" />
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-primary">{n.title}</span>
                  <span className="mt-0.5 block text-caption text-secondary">{n.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
