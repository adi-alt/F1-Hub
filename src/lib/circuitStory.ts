// The circuits pages' storylines, as plain sentences built from real data only: a round's result and the lead
// changes in its traced track story; a circuit's layouts through the years. Pure and tested; nothing here invents a
// fact - a sentence is left out when its data isn't there.
import type { RaceSummary } from "@/app/season/_service/season.pure";
import type { CircuitFacts } from "./circuitFacts";
import type { CircuitLayout } from "./circuitLayout";
import { seasonLabel } from "./circuitLayout";
import type { RaceTrackStory } from "./raceTrackStory";

export type RoundStory = {
  /** The one-line headline: who won, and how. */
  headline: string;
  /** Further sentences, in telling order. */
  lines: string[];
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The story of one round. A completed round: the winner and where they started, how the lead moved (from the
 * traced story), the decisive on-track move, the fastest lap. A round still to come: when, and what the track is. */
export function roundStory(race: RaceSummary, story: RaceTrackStory | null, facts: CircuitFacts | null, daysToGo: number | null): RoundStory {
  const nameOf = (code: string) => race.results.find((r) => r.driver === code)?.driverName ?? code;

  if (race.weekendStatus === "cancelled") return { headline: `${race.name} was cancelled.`, lines: [] };

  if (race.state !== "completed") {
    const lines: string[] = [];
    if (facts) lines.push(`${facts.lengthKm.toFixed(3)} km, ${plural(facts.turns, "turn")}${facts.trackType === "street" ? ", on the streets" : ""}.`);
    if (facts?.lapRecord) lines.push(`The lap record: ${facts.lapRecord.timeSec.toFixed(3)}s by ${facts.lapRecord.driverName}, ${facts.lapRecord.year}.`);
    if (race.forecast) lines.push(`${Math.round(race.forecast.airTempC)}°C expected, ${Math.round(race.forecast.rainProbability * 100)}% chance of rain.`);
    const when = daysToGo === null ? "" : daysToGo <= 0 ? " This weekend." : ` In ${plural(daysToGo, "day")}.`;
    return { headline: `${race.name}, round ${race.round}.${when}`, lines };
  }

  const winner = race.results.find((r) => r.finishPosition === 1);
  if (!winner) return { headline: `${race.name} has no result yet.`, lines: [] };
  const from = winner.grid === 1 ? "from pole" : winner.grid ? `from P${winner.grid}` : "";
  const headline = `${winner.driverName} won ${race.name}${from ? ` ${from}` : ""}.`;
  const lines: string[] = [];

  if (story && story.leadChanges.length > 0) {
    const onTrack = story.leadChanges.filter((c) => c.kind === "pass").length;
    const pit = story.leadChanges.filter((c) => c.kind === "pit").length;
    const parts = [onTrack > 0 ? `${plural(onTrack, "pass")} on track` : null, pit > 0 ? `${plural(pit, "pit-stop change")}` : null].filter(Boolean);
    lines.push(`The lead changed hands ${plural(story.leadChanges.length, "time")}${parts.length ? `: ${parts.join(", ")}` : ""}.`);
    const lastPass = [...story.leadChanges].reverse().find((c) => c.kind === "pass");
    if (lastPass && lastPass.kind === "pass") {
      // A turn name is only ever given for a verified location (the parser enforces it); otherwise just the lap.
      lines.push(`The last lead change on track: ${nameOf(lastPass.to)} passed ${nameOf(lastPass.from)} on lap ${lastPass.lap}${lastPass.near ? `, ${lastPass.near}` : ""}.`);
    }
  } else if (story) {
    lines.push("Lights to flag, the lead never changed hands.");
  }
  if (race.fastestLap) lines.push(`Fastest lap: ${race.fastestLap.driverName}, ${race.fastestLap.lapTimeSec.toFixed(3)}s.`);
  return { headline, lines };
}

export type EraStory = { title: string; lines: string[] };

/** One era of a circuit - a layout and the seasons it was raced - in words. `winners` are that era's winners by
 * season (from the circuit's timeline). */
export function eraStory(layout: CircuitLayout, previous: CircuitLayout | null, winners: { year: number; winner: string }[]): EraStory {
  const seasons = layout.seasons;
  const first = Math.min(...seasons);
  const title = layout.raceNameMatch ? `${first}: the ${layout.raceNameMatch[0].toUpperCase()}${layout.raceNameMatch.slice(1)} layout` : seasons.length === 1 ? `${first}` : seasonLabel(seasons);
  const lines: string[] = [];
  if (previous && !layout.raceNameMatch) lines.push(`A new layout from ${first}: the track changed from the ${seasonLabel(previous.seasons)} one.`);
  else if (!previous) lines.push(`The earliest layout on record, ${seasonLabel(seasons)}.`);
  lines.push(layout.source === "measured" ? "Traced from F1's own car-position data." : "Drawn from the layout's published plan.");
  const inEra = winners.filter((w) => seasons.includes(w.year));
  if (inEra.length > 0) {
    const counts = new Map<string, number>();
    for (const w of inEra) counts.set(w.winner, (counts.get(w.winner) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    lines.push(`${plural(inEra.length, "race")} won here in this era${top && top[1] > 1 ? `, ${top[0]} taking ${top[1]} of them` : ""}.`);
  }
  return { title, lines };
}
