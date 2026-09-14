"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { teamColor } from "@/lib/teamColors";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { WinnerMedia } from "../services/circuits.service";

/** Wraps a driver's name in a real link to their profile page when this app has resolved one -
 * plain text otherwise, never a link to nowhere. */
function DriverLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className="transition hover:text-white hover:underline">
      {children}
    </Link>
  );
}

export function PastWinnersList({ timeline, winnerMedia }: { timeline: CircuitYearRecord[]; winnerMedia: Map<number, WinnerMedia> }) {
  const [tab, setTab] = useState<"year" | "driver" | "team">("year");

  const withWinners = timeline.filter((r) => r.winnerDriver);
  
  const { topDrivers, topTeams } = useMemo(() => {
    const driverCounts = new Map<string, { count: number; team: string | null; media: WinnerMedia | null }>();
    const teamCounts = new Map<string, number>();

    for (const r of withWinners) {
      if (r.winnerDriver) {
        const existing = driverCounts.get(r.winnerDriver);
        const media = winnerMedia.get(r.year) ?? null;
        driverCounts.set(r.winnerDriver, { count: (existing?.count ?? 0) + 1, team: existing?.team ?? r.winnerTeam, media: existing?.media ?? media });
      }
      if (r.winnerTeam) {
        teamCounts.set(r.winnerTeam, (teamCounts.get(r.winnerTeam) || 0) + 1);
      }
    }

    return {
      topDrivers: Array.from(driverCounts.entries())
        .map(([driver, data]) => ({ driver, count: data.count, team: data.team, media: data.media }))
        .sort((a, b) => b.count - a.count),
      topTeams: Array.from(teamCounts.entries())
        .map(([team, count]) => ({ team, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [withWinners, winnerMedia]);

  if (withWinners.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-2">
        {(["year", "driver", "team"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
              tab === t ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t === "year" ? "By Year" : `Top ${t}s`}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "year" && (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    <th className="py-2 pr-4 font-mono font-normal">Year</th>
                    <th className="py-2 pr-4">Driver</th>
                    <th className="py-2 pr-4">Team</th>
                    <th className="py-2 pr-4">Grid</th>
                    <th className="py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.055]">
                  {withWinners.map((r) => {
                    const media = winnerMedia.get(r.year) ?? null;
                    return (
                      <tr key={r.year} className="group transition-colors hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-4 font-mono text-[13px] font-medium text-white">{r.year}</td>
                        <td className="py-2.5 pr-4 text-neutral-200">
                          <DriverLink href={media?.href ?? null}>
                            <div className="flex items-center gap-2">
                              <EntityAvatar imageUrl={media?.photoUrl ?? null} name={r.winnerDriver as string} size={22} />
                              {r.winnerDriver}
                            </div>
                          </DriverLink>
                        </td>
                        <td className="py-2.5 pr-4 text-neutral-400">
                          <span className="flex items-center gap-1.5">
                            {r.winnerTeam && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: teamColor(r.winnerTeam) }} />}
                            {r.winnerTeam || "—"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[11px] text-neutral-500">{r.winnerGrid != null ? `P${r.winnerGrid}` : "—"}</td>
                        <td className="py-2.5 text-right font-mono text-[11px] tabular-nums text-neutral-400">
                          {r.winningMarginSec != null ? `+${r.winningMarginSec.toFixed(3)}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === "driver" && (
            <ol className="divide-y divide-white/[0.055]">
              {topDrivers.map((d, i) => (
                <li key={d.driver} className="flex items-center justify-between gap-3 py-2.5">
                  <DriverLink href={d.media?.href ?? null}>
                    <div className="flex items-center gap-3">
                      <span className="w-5 font-mono text-[11px] text-neutral-600">{i + 1}</span>
                      <EntityAvatar imageUrl={d.media?.photoUrl ?? null} name={d.driver} size={22} />
                      {d.team && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: teamColor(d.team) }} />}
                      <span className="font-medium text-neutral-200">{d.driver}</span>
                    </div>
                  </DriverLink>
                  <span className="font-mono text-xs text-white">
                    {d.count} win{d.count !== 1 && "s"}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {tab === "team" && (
            <ol className="divide-y divide-white/[0.055]">
              {topTeams.map((t, i) => (
                <li key={t.team} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-5 font-mono text-[11px] text-neutral-600">{i + 1}</span>
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: teamColor(t.team) }} />
                    <span className="font-medium text-neutral-200">{t.team}</span>
                  </div>
                  <span className="font-mono text-xs text-white">{t.count} win{t.count !== 1 && "s"}</span>
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
