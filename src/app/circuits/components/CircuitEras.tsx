"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Typewriter } from "@/components/motion/Typewriter";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { eraStory } from "@/lib/circuitStory";
import { seasonLabel, type CircuitDrawing, type CircuitLayout } from "@/lib/circuitLayout";

export type EraEntry = { layout: CircuitLayout; drawing: CircuitDrawing };

/**
 * The track through time: every layout this circuit has had, as chapters. Pick an era (click, or ←/→ on the list)
 * and its layout is drawn, with a few sentences: what changed from the era before, where the drawing comes from,
 * and who won in it. Eras come from the track library - drawn history from 1950, measured layouts from F1's own car
 * positions from 2018 - so a change to the track is a new chapter on its own.
 */
export function CircuitEras({ eras, winners, currentYear }: { eras: EraEntry[]; winners: { year: number; winner: string }[]; currentYear: number }) {
  // Opens at the beginning, so the story runs forward through time - today's layout is already drawn in the hero.
  // A circuit with only one layout (nothing to tell) shows that one.
  // (findIndex is -1 when no era covers this season, e.g. a circuit whose only layout predates it - never an index.)
  const startIndex = useMemo(() => (eras.length > 1 ? 0 : Math.max(0, eras.findIndex((e) => e.layout.seasons.includes(currentYear)))), [eras, currentYear]);
  const [selected, setSelected] = useState(startIndex);
  if (eras.length === 0) return null;

  const era = eras[Math.min(Math.max(0, selected), eras.length - 1)];
  const previous = eras.slice(0, selected).reverse().find((e) => !e.layout.raceNameMatch) ?? null;
  const story = eraStory(era.layout, previous?.layout ?? null, winners);
  const go = (i: number) => setSelected(Math.max(0, Math.min(eras.length - 1, i)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(selected + 1);
    else if (e.key === "ArrowLeft") go(selected - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(eras.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="@container">
      <div className="grid items-center gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:gap-12">
        <CircuitCanvas drawing={era.drawing} className="max-h-60" lapColor="rgb(255 255 255 / 0.75)" lapSeconds={9} />
        <div className="min-w-0">
          <p className="text-caption text-tertiary">
            Era {selected + 1} of {eras.length}
          </p>
          <h3 className="mt-1 text-title-md font-semibold text-primary">{story.title}</h3>
          <p className="mt-3 text-body text-primary" aria-live="polite">
            <Typewriter key={era.layout.layoutId} text={story.lines[0] ?? ""} msPerChar={14} />
          </p>
          {story.lines.length > 1 && (
            <ul className="mt-3 space-y-1.5 border-l border-subtle pl-4 text-body-sm text-secondary">
              {story.lines.slice(1).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {eras.length > 1 && (
        <div
          role="listbox"
          aria-label="Eras of this circuit"
          aria-activedescendant={`era-${selected}`}
          tabIndex={0}
          onKeyDown={onKey}
          className="mt-6 flex flex-wrap justify-center gap-1.5 rounded-control focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/25"
        >
          {eras.map((e, i) => (
            <button
              key={e.layout.layoutId}
              id={`era-${i}`}
              type="button"
              role="option"
              aria-selected={i === selected}
              tabIndex={-1}
              onClick={() => setSelected(i)}
              className={`rounded-control border px-2.5 py-1 text-caption tabular transition-colors duration-fast ${i === selected ? "border-white/40 bg-white/[0.06] text-primary" : "border-subtle text-secondary hover:text-primary"}`}
            >
              {e.layout.raceNameMatch ? `${Math.min(...e.layout.seasons)} · ${e.layout.raceNameMatch}` : seasonLabel(e.layout.seasons)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
