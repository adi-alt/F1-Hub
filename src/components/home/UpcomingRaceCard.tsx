import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { PosterImage } from "./PosterImage";
import { StandingsWidget, type StandingsVariant } from "./StandingsWidget";
import type { Fact, SeasonStandings, TrackHistory } from "@/lib/personalization";
import type { CalendarEntry } from "@/lib/supabase/calendar";

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function weatherGist(forecast: NonNullable<CalendarEntry["weatherForecast"]>): string {
  const rainPct = Math.round(forecast.rainProbability * 100);
  const rainNote = rainPct >= 50 ? "likely wet" : rainPct >= 20 ? "a chance of rain" : "expected dry";
  return `${Math.round(forecast.airTempC)}°C · ${rainNote}`;
}

// Extracted so the impure Date.now() call isn't lexically inside a component function (eslint's
// react-hooks/purity rule) - same reasoning as page.tsx's pickStandingsVariant.
function daysUntil(sessionDateIso: string): number {
  return Math.ceil((new Date(sessionDateIso).getTime() - Date.now()) / 86_400_000);
}

type Poster = { key: string; href: string; imageUrl: string | null; title: string; subtitle: string };

/** The one thing the previous version got wrong: if the same driver is both the winningest and
 * the youngest-ever winner at a track, that was two posters of the same face with two captions.
 * Merges them into one card with both accolades when the ids match; otherwise two separate ones,
 * same as before. */
function buildDriverPosters(history: TrackHistory): Poster[] {
  const { topPerformer, youngestWinner } = history;
  if (topPerformer && youngestWinner && topPerformer.driverId === youngestWinner.driverId) {
    return [
      {
        key: topPerformer.driverId,
        href: topPerformer.href,
        imageUrl: topPerformer.photoUrl,
        title: topPerformer.driverName,
        subtitle: `${topPerformer.wins} wins here, the most of anyone — and the youngest ever, at ${youngestWinner.ageYears} in ${youngestWinner.year}`,
      },
    ];
  }
  const posters: Poster[] = [];
  if (topPerformer) {
    posters.push({
      key: topPerformer.driverId,
      href: topPerformer.href,
      imageUrl: topPerformer.photoUrl,
      title: topPerformer.driverName,
      subtitle: `${topPerformer.wins} wins here — the most of anyone`,
    });
  }
  if (youngestWinner) {
    posters.push({
      key: youngestWinner.driverId,
      href: youngestWinner.href,
      imageUrl: youngestWinner.photoUrl,
      title: youngestWinner.driverName,
      subtitle: `Youngest winner — age ${youngestWinner.ageYears} in ${youngestWinner.year}`,
    });
  }
  return posters;
}

/**
 * Everything about the upcoming race weekend, as one card, not four stacked boxes: the session
 * schedule and weather up top, track history posters, the season standings (table/bar/curve,
 * picked once per request — see page.tsx), and a closing strip of real computed facts. One
 * border, one background, internal dividers doing the section-separation work instead of gaps
 * between separate cards. The rotating circuit-photo backdrop lives one level up now, behind the
 * whole homepage (see page.tsx / RotatingBackdrop) — this card is plain, not its own photo layer.
 */
export function UpcomingRaceCard({
  calendar,
  circuitName,
  trackHistory,
  year,
  standings,
  standingsVariant,
  progression,
  facts,
}: {
  calendar: CalendarEntry;
  circuitName: string;
  trackHistory: TrackHistory | null;
  year: number;
  standings: SeasonStandings;
  standingsVariant: StandingsVariant;
  progression: Record<string, number>[];
  facts: Fact[];
}) {
  const raceSession = calendar.sessions.find((s) => s.label === "Race");
  const days = raceSession ? daysUntil(raceSession.date) : null;
  const driverPosters = trackHistory ? buildDriverPosters(trackHistory) : [];
  const hasTrackHistory = driverPosters.length > 0 || !!trackHistory?.topCurrentTeam;

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]">
      <div className="flex min-h-[200px] flex-col justify-end p-6 sm:min-h-[240px] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">
              Round {calendar.round}
              {days !== null && days >= 0 ? ` · in ${days} day${days === 1 ? "" : "s"}` : ""}
            </p>
            <h2 className="mt-1 text-3xl font-bold text-white">{calendar.name}</h2>
            <p className="mt-1 text-sm text-neutral-400">{circuitName}</p>
          </div>
          {calendar.weatherForecast && (
            <div className="rounded-xl bg-black/40 px-4 py-2 text-right text-sm text-neutral-200 backdrop-blur-sm">
              <p>{weatherGist(calendar.weatherForecast)}</p>
              {calendar.weatherForecast.source === "historical_fallback" && <p className="text-xs text-neutral-500">historical estimate</p>}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8 p-6 sm:p-8">
        {calendar.sessions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {calendar.sessions.map((s) => (
              <div key={s.label} className="rounded-full bg-black/30 px-3.5 py-2 text-xs">
                <span className="font-semibold text-white">{s.label}</span>
                <span className="ml-2 text-neutral-400">{formatSessionDate(s.date)}</span>
              </div>
            ))}
          </div>
        )}

        {hasTrackHistory && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Track history — {trackHistory!.totalRaces} races since {trackHistory!.firstYear}
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {driverPosters.map((p) => (
                <Link key={p.key} href={p.href} className="block transition hover:opacity-90">
                  <PosterImage imageUrl={p.imageUrl} title={p.title} subtitle={p.subtitle} />
                </Link>
              ))}
              {trackHistory?.topCurrentTeam && (
                <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--f1-line)] bg-black/20 p-6 text-center">
                  <EntityAvatar imageUrl={trackHistory.topCurrentTeam.logoUrl} name={trackHistory.topCurrentTeam.name} size={72} fit="contain" />
                  <div>
                    <p className="font-semibold text-white">{trackHistory.topCurrentTeam.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {trackHistory.topCurrentTeam.wins} wins here — most of any team still on the grid
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {standings.drivers.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{year} standings</p>
            <StandingsWidget variant={standingsVariant} drivers={standings.drivers} progression={progression} />
          </div>
        )}

        {facts.length > 0 && (
          <div className="grid gap-3 border-t border-[var(--f1-line)] pt-6 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.text} className="flex items-start gap-3">
                <span className="text-xl" aria-hidden>
                  {fact.icon}
                </span>
                <p className="text-sm text-neutral-300">{fact.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
