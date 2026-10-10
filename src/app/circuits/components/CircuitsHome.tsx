"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Typewriter } from "@/components/motion/Typewriter";
import { Reveal } from "@/components/motion/Reveal";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { SeasonScrubber } from "@/app/season/_components/SeasonScrubber";
import { circuitHref, raceHref } from "@/lib/routes";
import { roundStory } from "@/lib/circuitStory";
import { nodeStatus } from "./nodeStatus";
import { CircuitInsights } from "./CircuitInsights";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import type { CircuitExplorerEntry } from "../services/circuits.service";

/**
 * The Circuits home: the season told circuit by circuit. A round scrubber (the one the season page uses, here
 * selecting a round rather than opening it) drives a storyline - the circuit as it was raced this season, drawn from
 * the track library, and the round's story in sentences built from its real result and traced lead changes. Ask Apex's
 * circuit scope follows the selection, as before.
 */
export function CircuitsHome({
  entries,
  favoriteTracks,
  year,
  completedCount,
  remainingCount,
}: {
  entries: CircuitExplorerEntry[];
  favoriteTracks: string[];
  year: number;
  completedCount: number;
  remainingCount: number;
}) {
  const defaultRound = useMemo(() => {
    const current = entries.find((e) => nodeStatus(e.race) === "current");
    if (current) return current.race.round;
    const lastCompleted = [...entries].reverse().find((e) => nodeStatus(e.race) === "completed");
    return (lastCompleted ?? entries[0])?.race.round ?? null;
  }, [entries]);
  const [selectedRound, setSelectedRound] = useState<number | null>(defaultRound);
  const selected = entries.find((e) => e.race.round === selectedRound) ?? entries.find((e) => e.race.round === defaultRound) ?? null;
  const raceSummaries = useMemo(() => entries.map((e) => e.race), [entries]);

  const story = selected ? roundStory(selected.race, selected.story, selected.facts, selected.daysToGo) : null;
  const status = selected ? nodeStatus(selected.race) : null;
  const facts = selected?.facts;
  const location = selected ? [selected.race.circuit, selected.race.country].filter(Boolean).join(", ") : "";
  const favourite = !!selected && favoriteTracks.includes(selected.race.circuit ?? selected.race.name);

  return (
    <>
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="flex items-baseline gap-3">
            <span className="text-[44px] font-bold leading-none tracking-[-0.03em] text-white sm:text-6xl">{year}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-tertiary">Circuits</span>
          </h1>
          <p className="text-xs tabular text-tertiary">
            <span className="font-medium text-neutral-300">{entries.length}</span> circuits · <span className="font-medium text-neutral-300">{completedCount}</span> raced ·{" "}
            <span className="font-medium text-neutral-300">{remainingCount}</span> to come
          </p>
        </div>
        <div className="mt-4">
          <SeasonScrubber year={year} raceSummaries={raceSummaries} selectedRound={selected?.race.round ?? null} onSelectRound={setSelectedRound} />
        </div>
      </header>

      {selected && story && (
        <Reveal>
          <section aria-label={`${selected.race.name}: the circuit and its story`} className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0">
              {selected.drawing ? (
                <>
                  <CircuitCanvas drawing={selected.drawing} className="max-h-[24rem]" />
                  {!selected.drawing.seasons.includes(year) && (
                    <p className="mt-2 text-center text-caption text-tertiary">As last raced, {selected.drawing.seasons[selected.drawing.seasons.length - 1]}. This season&apos;s layout is confirmed once it has been raced.</p>
                  )}
                </>
              ) : (
                <p className="rounded-card border border-subtle px-4 py-10 text-center text-body-sm text-secondary">No circuit drawing on record yet.</p>
              )}
            </div>

            <div className="min-w-0">
              <p className={`text-caption ${status === "current" ? "text-brand-text" : "text-tertiary"}`}>
                Round {selected.race.round} · {status === "completed" ? "Completed" : status === "current" ? "Next" : "Upcoming"}
                {favourite && <span className="ml-2 text-secondary">★ A favourite</span>}
              </p>
              <h2 className="mt-1 text-title-lg font-semibold text-primary">{selected.race.name}</h2>
              {location && <p className="mt-0.5 text-body-sm text-secondary">{location}</p>}

              <p className="mt-5 text-body font-medium text-primary" aria-live="polite">
                <Typewriter key={`${selected.race.round}-h`} text={story.headline} msPerChar={14} />
              </p>
              {story.lines.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-l border-subtle pl-4 text-body-sm text-secondary">
                  {story.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}

              {facts && (
                <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-subtle pt-4">
                  <Fact label="Length" value={`${facts.lengthKm.toFixed(3)} km`} />
                  <Fact label="Turns" value={String(facts.turns)} />
                  <Fact label="Type" value={facts.trackType === "street" ? "Street" : facts.trackType === "hybrid" ? "Hybrid" : "Permanent"} />
                  <Fact label="First GP" value={String(facts.firstGrandPrix)} />
                  {facts.drsZones != null && <Fact label="DRS zones" value={String(facts.drsZones)} />}
                  {facts.lapRecord && <Fact label={`Lap record · ${facts.lapRecord.year}`} value={`${facts.lapRecord.timeSec.toFixed(3)}s`} />}
                </dl>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link
                  href={circuitHref(selected.race.circuit ?? selected.race.name)}
                  className="inline-flex items-center gap-1 rounded-control bg-brand px-3.5 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Open the circuit →
                </Link>
                {selected.hasReplay && (
                  <Link href={`${circuitHref(selected.race.circuit ?? selected.race.name)}#replay`} className="text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
                    Watch the replay
                  </Link>
                )}
                {status === "completed" && (
                  <Link href={raceHref(year, selected.race.round, selected.race.name)} className="text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
                    Full race analysis
                  </Link>
                )}
              </div>
            </div>
          </section>

          <div className="mt-12">
            <CircuitInsights location={selected.race.circuit ?? selected.race.name} year={year} />
          </div>
          <CircuitApexScope
            location={selected.race.circuit ?? selected.race.name}
            circuitName={selected.facts?.venueName ?? selected.race.circuit ?? selected.race.name}
            year={year}
            status={selected.race.state}
          />
        </Reveal>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-secondary">{label}</dt>
      <dd className="mt-0.5 truncate text-body-sm font-medium tabular text-primary">{value}</dd>
    </div>
  );
}
