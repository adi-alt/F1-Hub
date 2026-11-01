"use client";

import { Activity, Disc, Sparkles, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { F1DataCard, StintDataCard, TelemetryDataCard, WinProbabilityDataCard } from "@/lib/communities";
import { F1DataCardEmbed } from "./F1DataCardEmbed";

const subscribeNothing = () => () => {};

type CardTab = "telemetry" | "stint" | "probability";

// Realistic presets for current & recent race weekends
const TELEMETRY_PRESETS: TelemetryDataCard[] = [
  {
    kind: "telemetry",
    raceName: "Mexico City Grand Prix",
    session: "FP2",
    circuit: "Autódromo Hermanos Rodríguez",
    driver1: { code: "LEC", name: "Charles Leclerc", team: "Ferrari", lapTime: "1:17.827" },
    driver2: { code: "NOR", name: "Lando Norris", team: "McLaren", lapTime: "1:17.930" },
    deltaSeconds: -0.103,
    sectorDeltas: [-0.045, 0.082, -0.140],
    speedTrap: { driver1Speed: 344, driver2Speed: 339 },
  },
  {
    kind: "telemetry",
    raceName: "Mexico City Grand Prix",
    session: "Qualifying Simulation",
    circuit: "Autódromo Hermanos Rodríguez",
    driver1: { code: "VER", name: "Max Verstappen", team: "Red Bull", lapTime: "1:17.512" },
    driver2: { code: "NOR", name: "Lando Norris", team: "McLaren", lapTime: "1:17.654" },
    deltaSeconds: -0.142,
    sectorDeltas: [-0.038, -0.125, 0.021],
    speedTrap: { driver1Speed: 348, driver2Speed: 341 },
  },
];

const STINT_PRESETS: StintDataCard[] = [
  {
    kind: "stint",
    raceName: "Mexico City Grand Prix",
    driver: { code: "LEC", name: "Charles Leclerc", team: "Ferrari" },
    totalLaps: 71,
    stints: [
      { compound: "MEDIUM", laps: 28, startLap: 1, endLap: 28, isNew: true },
      { compound: "HARD", laps: 43, startLap: 29, endLap: 71, isNew: true },
    ],
  },
  {
    kind: "stint",
    raceName: "Mexico City Grand Prix",
    driver: { code: "NOR", name: "Lando Norris", team: "McLaren" },
    totalLaps: 71,
    stints: [
      { compound: "SOFT", laps: 18, startLap: 1, endLap: 18, isNew: true },
      { compound: "HARD", laps: 34, startLap: 19, endLap: 52, isNew: true },
      { compound: "SOFT", laps: 19, startLap: 53, endLap: 71, isNew: false },
    ],
  },
];

const WIN_PROB_PRESETS: WinProbabilityDataCard[] = [
  {
    kind: "win_probability",
    raceName: "Mexico City Grand Prix",
    simulationsCount: 10000,
    headline: "Norris holds the edge with high altitude aerodynamic efficiency.",
    leader: { code: "NOR", name: "Lando Norris", team: "McLaren", winProb: 0.42, podiumProb: 0.81 },
    contenders: [
      { code: "VER", name: "Max Verstappen", team: "Red Bull", winProb: 0.31, podiumProb: 0.74 },
      { code: "LEC", name: "Charles Leclerc", team: "Ferrari", winProb: 0.16, podiumProb: 0.52 },
      { code: "RUS", name: "George Russell", team: "Mercedes", winProb: 0.08, podiumProb: 0.38 },
    ],
    projectedPodium: ["NOR", "VER", "LEC"],
  },
];

export function F1DataCardModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (card: F1DataCard) => void;
}) {
  const isClient = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [tab, setTab] = useState<CardTab>("telemetry");
  const [selectedTelemetry, setSelectedTelemetry] = useState<TelemetryDataCard>(TELEMETRY_PRESETS[0]);
  const [selectedStint, setSelectedStint] = useState<StintDataCard>(STINT_PRESETS[0]);
  const [selectedWinProb, setSelectedWinProb] = useState<WinProbabilityDataCard>(WIN_PROB_PRESETS[0]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !isClient) return null;

  const currentCard: F1DataCard =
    tab === "telemetry" ? selectedTelemetry : tab === "stint" ? selectedStint : selectedWinProb;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="f1-card-modal-title"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-card border border-white/15 bg-surface-0 shadow-2xl animate-in fade-in zoom-in-95 duration-fast">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-control bg-brand/10 text-brand">
              <Icon icon={Activity} size={16} />
            </span>
            <h2 id="f1-card-modal-title" className="text-title-sm font-semibold text-primary">
              Attach F1 Data Card
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-control p-1 text-tertiary transition-colors hover:bg-white/[0.06] hover:text-primary"
          >
            <Icon icon={X} size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-white/[0.02] px-5 pt-2">
          <button
            type="button"
            onClick={() => setTab("telemetry")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-caption font-medium transition-colors ${
              tab === "telemetry"
                ? "border-brand text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            <Icon icon={Activity} size={16} className="size-3.5" />
            Telemetry Delta
          </button>
          <button
            type="button"
            onClick={() => setTab("stint")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-caption font-medium transition-colors ${
              tab === "stint"
                ? "border-brand text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            <Icon icon={Disc} size={16} className="size-3.5" />
            Tire Strategy
          </button>
          <button
            type="button"
            onClick={() => setTab("probability")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-caption font-medium transition-colors ${
              tab === "probability"
                ? "border-brand text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            <Icon icon={Sparkles} size={16} className="size-3.5" />
            Win Probability
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-caption font-semibold text-secondary mb-2">Select Live Snapshot:</p>
            <div className="flex flex-wrap gap-2">
              {tab === "telemetry" &&
                TELEMETRY_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedTelemetry(p)}
                    className={`rounded-control border px-3 py-1.5 text-caption transition-colors ${
                      selectedTelemetry.driver1.code === p.driver1.code && selectedTelemetry.session === p.session
                        ? "border-brand bg-brand/10 font-medium text-brand"
                        : "border-white/10 bg-white/[0.03] text-secondary hover:bg-white/[0.06] hover:text-primary"
                    }`}
                  >
                    {p.driver1.code} vs {p.driver2.code} ({p.session})
                  </button>
                ))}

              {tab === "stint" &&
                STINT_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedStint(p)}
                    className={`rounded-control border px-3 py-1.5 text-caption transition-colors ${
                      selectedStint.driver.code === p.driver.code
                        ? "border-brand bg-brand/10 font-medium text-brand"
                        : "border-white/10 bg-white/[0.03] text-secondary hover:bg-white/[0.06] hover:text-primary"
                    }`}
                  >
                    {p.driver.name} ({p.stints.map((s) => s.compound[0]).join(" → ")})
                  </button>
                ))}

              {tab === "probability" &&
                WIN_PROB_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedWinProb(p)}
                    className={`rounded-control border px-3 py-1.5 text-caption transition-colors ${
                      selectedWinProb.leader.code === p.leader.code
                        ? "border-brand bg-brand/10 font-medium text-brand"
                        : "border-white/10 bg-white/[0.03] text-secondary hover:bg-white/[0.06] hover:text-primary"
                    }`}
                  >
                    {p.raceName} (Fav: {p.leader.name})
                  </button>
                ))}
            </div>
          </div>

          <div>
            <p className="text-caption font-semibold text-secondary mb-2">Live Preview:</p>
            <F1DataCardEmbed dataCard={currentCard} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onSelect(currentCard);
              onClose();
            }}
          >
            Attach to Post
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

