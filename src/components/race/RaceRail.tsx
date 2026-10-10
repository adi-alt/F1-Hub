import Link from "next/link";
import { CloudRain, Sun } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Surface } from "@/components/ui/Surface";
import { tiltProps } from "@/components/motion/useTilt";
import { groupHref } from "@/lib/routes";
import type { RaceCommunityCard } from "@/lib/groupPredictionTypes";
import type { PersonalRaceContext } from "@/lib/personalRaceBriefing";
import type { PredictionAccuracy } from "@/lib/predictionAccuracy";
import type { WeatherForecast } from "@/lib/supabase/calendar";
import type { SessionWeather } from "@/lib/types/race";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div {...tiltProps()} className="tilt h-full rounded-card">
      <Surface level={1} padding="md" as="section" aria-label={title} className="h-full">
        <h2 className="text-body-sm font-semibold text-primary">{title}</h2>
        <div className="mt-3">{children}</div>
      </Surface>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-body-sm">
      <span className="min-w-0 truncate text-secondary">{label}</span>
      <span className="shrink-0 tabular text-primary">{value}</span>
    </div>
  );
}

function Conditions({ weather, forecast }: { weather?: SessionWeather | null; forecast?: WeatherForecast | null }) {
  if (weather) {
    return (
      <Block title="Race conditions">
        <div className="flex items-center gap-3">
          <Icon icon={weather.rainfall ? CloudRain : Sun} size={24} className="text-secondary" />
          <p className="text-title-md tabular text-primary">{Math.round(weather.airTempC)}°C</p>
        </div>
        <Row label="Track" value={`${Math.round(weather.trackTempC)}°C`} />
        <Row label="Humidity" value={`${Math.round(weather.humidityPct)}%`} />
        <Row label="Rain" value={weather.rainfall ? "Yes" : "Dry"} />
      </Block>
    );
  }
  if (forecast) {
    return (
      <Block title="Forecast for race day">
        <div className="flex items-center gap-3">
          <Icon icon={forecast.rainProbability >= 0.4 ? CloudRain : Sun} size={24} className="text-secondary" />
          <p className="text-title-md tabular text-primary">{Math.round(forecast.airTempC)}°C</p>
        </div>
        <Row label="Chance of rain" value={`${Math.round(forecast.rainProbability * 100)}%`} />
        <ProvenanceLine className="mt-2" source={forecast.source === "openweathermap" ? "OpenWeatherMap forecast" : "Typical weather here"} status={forecast.source === "openweathermap" ? undefined : "no live forecast yet"} />
      </Block>
    );
  }
  return null;
}

/** Whether "You at <circuit>" has anything to show (the race banner's ⋯ menu offers it only then). */
export function hasYourRecord(personal: PersonalRaceContext) {
  return personal.isFirstTime || !!personal.favoriteDriver || !!personal.favoriteTeam || !!personal.accuracy;
}

export function YourRecord({ circuit, personal }: { circuit: string; personal: PersonalRaceContext }) {
  if (personal.isFirstTime) {
    return (
      <Block title="Make it yours">
        <p className="text-body-sm text-secondary">Pick favourite drivers and teams, and this page shows how they have done at {circuit}.</p>
        <Link href="/profile?section=personalisation" className="mt-3 inline-block rounded-control text-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          Set favourites
        </Link>
      </Block>
    );
  }
  const rows = [
    personal.favoriteDriver && { label: personal.favoriteDriver.name, value: `${personal.favoriteDriver.winsHere} ${personal.favoriteDriver.winsHere === 1 ? "win" : "wins"} here` },
    personal.favoriteTeam && { label: personal.favoriteTeam.name, value: `${personal.favoriteTeam.winsHere} ${personal.favoriteTeam.winsHere === 1 ? "win" : "wins"} here` },
    personal.accuracy && { label: "Your picks here", value: `${personal.accuracy.correct} of ${personal.accuracy.total} right` },
  ].filter((r): r is { label: string; value: string } => Boolean(r));
  if (rows.length === 0) return null;
  return (
    <Block title={`You at ${circuit}`}>
      <div className="divide-y divide-subtle">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </Block>
  );
}

export function ModelVerdict({ accuracy, nameOf }: { accuracy: PredictionAccuracy; nameOf: (code: string) => string }) {
  const right = accuracy.predictedWinner === accuracy.actualWinner;
  return (
    <Block title="How the model did">
      <p className="text-body-sm text-primary">
        {right ? `Called it: ${nameOf(accuracy.actualWinner)} to win.` : `Picked ${nameOf(accuracy.predictedWinner)}; ${nameOf(accuracy.actualWinner)} won.`}
      </p>
      <Row label="Podium places right" value={`${accuracy.podiumHits} of 3`} />
      <Row label="Average position error" value={accuracy.positionMAE.toFixed(1)} />
      {accuracy.reconstructed && <ProvenanceLine className="mt-2" source="Prediction rebuilt after the race" status="not frozen beforehand" />}
    </Block>
  );
}

function Communities({ communities }: { communities: RaceCommunityCard[] }) {
  if (communities.length === 0) return null;
  return (
    <Block title="Communities on this race">
      <ul className="space-y-1">
        {communities.slice(0, 3).map((c) => (
          <li key={c.groupId}>
            <Link
              href={c.prediction ? `${groupHref(c.groupId)}?tab=predictions` : groupHref(c.groupId)}
              className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <EntityAvatar imageUrl={c.avatarUrl} name={c.name} seed={c.groupId} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-primary">{c.name}</span>
                <span className="block text-caption text-secondary">
                  {c.prediction ? `${c.prediction.entryCount} ${c.prediction.entryCount === 1 ? "entry" : "entries"}` : `${c.memberCount} members`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/**
 * The race page's rail (spec §3.4): conditions and the communities predicting the race. Your record here and how
 * the model did live in the race banner's ⋯ menu (RaceMoreMenu); the countdown and the winner in the header.
 */
export function RaceRail({
  completed,
  weather,
  forecast,
  communities,
}: {
  completed: boolean;
  weather?: SessionWeather | null;
  forecast?: WeatherForecast | null;
  communities: RaceCommunityCard[];
}) {
  if (!weather && (completed || !forecast) && communities.length === 0) return null;
  return (
    // One compact row in the page's own column (the owner asked for no right-hand rail): up to three short
    // blocks side by side from sm, stacked on a phone.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {completed ? <Conditions weather={weather} /> : <Conditions weather={weather} forecast={forecast} />}
      <Communities communities={communities} />
    </div>
  );
}
