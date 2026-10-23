"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { Sheet } from "@/components/ui/Dialog";
import { Popover } from "@/components/ui/Popover";
import type { PersonalRaceContext } from "@/lib/personalRaceBriefing";
import type { PolePredictionAccuracy, PredictionAccuracy } from "@/lib/predictionAccuracy";
import type { RaceDoc } from "@/lib/types/race";
import { PolePredictionComparison } from "./PolePredictionComparison";
import { PredictionComparison } from "./PredictionComparison";
import { hasYourRecord, ModelVerdict, YourRecord } from "./RaceRail";

type Panel = "predictions" | "you";

/**
 * The race banner's ⋯ menu: the secondary, per-reader panels that used to sit in the page body. Before the
 * race, how the model's predictions did; "You at <circuit>" in both phases. Each opens in a side sheet,
 * so the page itself reads as the race's story. The reader's own pick is a visible section of the page
 * (RacePickSection, id "pick"), not in here.
 */
export function RaceMoreMenu({
  race,
  completed,
  accuracy,
  poleAccuracy,
  personal,
}: {
  race: RaceDoc;
  completed: boolean;
  accuracy: PredictionAccuracy | null;
  poleAccuracy: PolePredictionAccuracy | null;
  personal: PersonalRaceContext;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);

  const names = new Map([...(race.inputs ?? []), ...(race.results ?? [])].map((d) => [d.driver, d.driverName]));
  const nameOf = (code: string) => names.get(code) ?? code;

  const items: { id: Panel; label: string; hint: string }[] = [
    ...(completed && (accuracy || poleAccuracy) ? [{ id: "predictions" as const, label: "How the predictions did", hint: "The model against the result" }] : []),
    ...(hasYourRecord(personal) ? [{ id: "you" as const, label: `You at ${race.circuit}`, hint: "Your favourites' record here" }] : []),
  ];
  if (items.length === 0) return null;

  const close = () => setPanel(null);
  const title = panel === "predictions" ? "How the predictions did" : `You at ${race.circuit}`;

  return (
    <>
      <Popover
        align="end"
        ariaLabel="More for this race"
        panelClassName="p-1"
        glass
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="More for this race"
            className={`flex size-9 items-center justify-center rounded-control border border-subtle text-secondary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${open ? "bg-white/[0.06] text-primary" : ""}`}
          >
            <MoreVertical aria-hidden size={18} strokeWidth={1.75} />
          </button>
        )}
      >
        {({ close: closeMenu }) => (
          <ul className="py-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    setPanel(item.id);
                  }}
                  className="block w-full rounded-control px-3 py-2 text-left transition-colors duration-fast hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none"
                >
                  <span className="block text-body-sm font-medium text-primary">{item.label}</span>
                  <span className="block text-caption text-secondary">{item.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>

      <Sheet open={panel !== null} onClose={close} title={title} size="lg">
        {panel === "predictions" && (
          <div className="space-y-4">
            {accuracy && <ModelVerdict accuracy={accuracy} nameOf={nameOf} />}
            {accuracy && <PredictionComparison accuracy={accuracy} />}
            {poleAccuracy && <PolePredictionComparison accuracy={poleAccuracy} />}
          </div>
        )}
        {panel === "you" && <YourRecord circuit={race.circuit} personal={personal} />}
      </Sheet>
    </>
  );
}
