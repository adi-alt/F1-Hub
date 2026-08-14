"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { teamColor } from "@/lib/teamColors";
import type { ArchivePitStopEntry, ArchiveQualifyingEntry, ArchiveResultEntry } from "@/lib/firestore/archive";

function statusColor(status: string): string {
  if (status === "Finished" || /^\+\d+ Lap/.test(status)) return "text-neutral-400";
  if (/Accident|Collision|Spun off|Disqualified/i.test(status)) return "text-[var(--f1-red)]";
  return "text-amber-400"; // mechanical/other retirement (Engine, Gearbox, Overheating, ...)
}

function PodiumCard({ r, rank }: { r: ArchiveResultEntry; rank: 1 | 2 | 3 }) {
  const color = teamColor(r.constructor);
  // First place reads visually heavier (bigger number, brighter border) without needing a
  // different component — a plain ranked list wouldn't be able to do this at all.
  return (
    <div
      className="flex-1 rounded-xl border p-4"
      style={{
        borderColor: rank === 1 ? color : "var(--f1-line)",
        background: `linear-gradient(160deg, ${color}22, transparent 65%)`,
      }}
    >
      <p className="text-3xl font-black" style={{ color }}>
        P{rank}
      </p>
      <p className="mt-2 truncate font-semibold text-white">{r.driverName}</p>
      <p className="truncate text-xs text-neutral-400">{r.constructor}</p>
      <p className="mt-2 text-sm text-neutral-300">{r.time ?? "—"}</p>
    </div>
  );
}

// A card-based leaderboard, not a <table> — the podium (P1-3) gets its own visually distinct
// row of larger cards, and the rest of the field is a tighter list below. A driver's row expands
// on click to show their qualifying result and pit stops inline (cross-referenced by driverId
// from the arrays the race page already loaded), so the three archive datasets read as one
// connected story per driver instead of three disconnected sections.
export function ResultsBoard({
  results,
  qualifying = [],
  pitStops = [],
}: {
  results: ArchiveResultEntry[];
  qualifying?: ArchiveQualifyingEntry[];
  pitStops?: ArchivePitStopEntry[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const podium = results.filter((r) => r.position <= 3).sort((a, b) => a.position - b.position);
  const rest = results.filter((r) => r.position > 3);

  return (
    <div className="space-y-4">
      {podium.length === 3 && (
        <div className="flex gap-3">
          <PodiumCard r={podium[0]} rank={1} />
          <PodiumCard r={podium[1]} rank={2} />
          <PodiumCard r={podium[2]} rank={3} />
        </div>
      )}

      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="space-y-1.5">
        {rest.map((r) => {
          const isOpen = expanded === r.driverId;
          const quali = qualifying.find((q) => q.driverId === r.driverId);
          const stops = pitStops.filter((p) => p.driverId === r.driverId);
          const color = teamColor(r.constructor);

          return (
            <motion.div
              key={r.driverId}
              variants={staggerItem}
              className="overflow-hidden rounded-lg border-l-4"
              style={{ borderLeftColor: color, background: `${color}0f` }}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : r.driverId)}
                className="flex w-full items-center gap-3 py-2 pl-3 pr-3 text-left transition hover:brightness-125"
              >
                <span className="w-6 shrink-0 text-sm font-bold text-white">{r.positionText}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-white">{r.driverName}</span>
                    {r.fastestLap?.rank === 1 && (
                      <span className="shrink-0 rounded-full bg-[var(--f1-red)]/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--f1-red)]">
                        FL
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">{r.constructor}</span>
                </span>
                <span className={`hidden shrink-0 text-xs sm:block ${statusColor(r.status)}`}>{r.status}</span>
                <span className="shrink-0 text-right text-xs text-neutral-400">{r.time ?? "—"}</span>
                <span className="w-10 shrink-0 text-right text-xs text-neutral-500">{r.points > 0 ? `${r.points} pts` : ""}</span>
                <svg
                  viewBox="0 0 20 20"
                  className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  aria-hidden
                >
                  <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="grid gap-3 border-t border-white/10 px-3 py-2.5 text-sm sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Qualifying</p>
                        {quali ? (
                          <p className="text-neutral-300">
                            P{quali.position} — {quali.q3 ?? quali.q2 ?? quali.q1 ?? "no time"}
                          </p>
                        ) : (
                          <p className="text-neutral-500">Not available for this race.</p>
                        )}
                        <p className="mt-1 text-neutral-500">Grid: {r.grid ?? "—"}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                          Pit stops {stops.length > 0 && `(${stops.length})`}
                        </p>
                        {stops.length > 0 ? (
                          <ul className="space-y-0.5 text-neutral-300">
                            {stops
                              .sort((a, b) => a.stop - b.stop)
                              .map((s) => (
                                <li key={s.stop}>
                                  Lap {s.lap} — {s.durationSec !== null ? `${s.durationSec.toFixed(3)}s` : "—"}
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="text-neutral-500">None recorded.</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
