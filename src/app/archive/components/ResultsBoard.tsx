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

// Card-based leaderboard, not a <table> — a driver's row expands on click to show their
// qualifying result and pit stops inline (cross-referenced by driverId from the arrays the race
// page already loaded), so the three archive datasets read as one connected story per driver
// instead of three disconnected sections.
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

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="space-y-2">
      {results.map((r) => {
        const isOpen = expanded === r.driverId;
        const quali = qualifying.find((q) => q.driverId === r.driverId);
        const stops = pitStops.filter((p) => p.driverId === r.driverId);
        const color = teamColor(r.constructor);

        return (
          <motion.div
            key={r.driverId}
            variants={staggerItem}
            className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]"
          >
            <button
              onClick={() => setExpanded(isOpen ? null : r.driverId)}
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]"
            >
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="w-8 shrink-0 text-lg font-bold text-white">{r.positionText}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-white">{r.driverName}</span>
                  {r.fastestLap?.rank === 1 && (
                    <span className="shrink-0 rounded-full bg-[var(--f1-red)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--f1-red)]">
                      Fastest lap
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-neutral-500">{r.constructor}</span>
              </span>
              <span className={`hidden shrink-0 text-sm sm:block ${statusColor(r.status)}`}>{r.status}</span>
              <span className="shrink-0 text-right text-sm text-neutral-400">
                <span className="block">{r.time ?? "—"}</span>
                <span className="block text-xs text-neutral-500">{r.points} pts</span>
              </span>
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                fill="currentColor"
                aria-hidden
              >
                <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
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
                  <div className="grid gap-3 border-t border-[var(--f1-line)] px-4 py-3 text-sm sm:grid-cols-2">
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
  );
}
