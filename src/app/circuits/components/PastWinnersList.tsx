"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { WinnerMedia } from "../services/circuits.service";
import type { CurrentTeam } from "@/lib/supabase/media";

const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };
const HEADER_ROW_CLASS = "sticky top-0 z-10 border-b border-white/[0.08] text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md";
const PAGE_SIZE = 8;

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

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2">
      <span className="text-[11px] text-neutral-600">
        Page {page} of {pageCount}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * The circuit's own real history - Drivers/Constructors/By Year, all three built on the same
 * table structure and theme as the Season page's own Championship table (sticky translucent
 * header, a real team logo via EntityAvatar rather than a plain color dot, bordered card
 * container), not a bespoke look. A historic team with no current-roster logo just falls back to
 * EntityAvatar's own initial, same as a driver with no photo - never a broken image, never an
 * invented one.
 */
export function PastWinnersList({
  timeline,
  winnerMedia,
  currentTeams,
}: {
  timeline: CircuitYearRecord[];
  winnerMedia: Map<number, WinnerMedia>;
  currentTeams: CurrentTeam[];
}) {
  const [tab, setTab] = useState<"year" | "driver" | "team">("year");
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the tab changes - a page number that made sense for "By Year" is
  // meaningless the instant the list underneath it becomes "Top Drivers" instead.
  const [prevTab, setPrevTab] = useState(tab);
  if (prevTab !== tab) {
    setPrevTab(tab);
    setPage(1);
  }

  const logoByTeam = useMemo(() => new Map(currentTeams.map((t) => [t.name, t.logoUrl])), [currentTeams]);
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

  const activeList = tab === "year" ? withWinners : tab === "driver" ? topDrivers : topTeams;
  const pageCount = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageWinners = withWinners.slice(start, start + PAGE_SIZE);
  const pageDrivers = topDrivers.slice(start, start + PAGE_SIZE);
  const pageTeams = topTeams.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
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

      <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-[var(--f1-carbon)]/50">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            {tab === "year" && (
              <table className="w-full text-left text-sm">
                <thead className={HEADER_ROW_CLASS} style={HEADER_STYLE}>
                  <tr>
                    <th className="px-3 py-2.5 font-mono font-semibold">Year</th>
                    <th className="px-3 py-2.5 font-semibold">Driver</th>
                    <th className="px-3 py-2.5 font-semibold">Team</th>
                    <th className="px-3 py-2.5 font-semibold">Grid</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--f1-line)]">
                  {pageWinners.map((r) => {
                    const media = winnerMedia.get(r.year) ?? null;
                    return (
                      <tr key={r.year} className="group transition-colors hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-[13px] font-medium text-white">{r.year}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-200">
                          <DriverLink href={media?.href ?? null}>
                            <div className="flex min-w-0 items-center gap-2">
                              <EntityAvatar imageUrl={media?.photoUrl ?? null} name={r.winnerDriver as string} size={26} fit="cover" />
                              <span className="truncate">{r.winnerDriver}</span>
                            </div>
                          </DriverLink>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {r.winnerTeam && <EntityAvatar imageUrl={logoByTeam.get(r.winnerTeam) ?? null} name={r.winnerTeam} size={16} shape="square" fit="contain" />}
                            <span className="truncate">{r.winnerTeam || "—"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-neutral-500">{r.winnerGrid != null ? `P${r.winnerGrid}` : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums text-neutral-400">
                          {r.winningMarginSec != null ? `+${r.winningMarginSec.toFixed(3)}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {tab === "driver" && (
              <table className="w-full text-left text-sm">
                <thead className={HEADER_ROW_CLASS} style={HEADER_STYLE}>
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">#</th>
                    <th className="px-3 py-2.5 font-semibold">Driver</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--f1-line)]">
                  {pageDrivers.map((d, i) => (
                    <tr key={d.driver} className="transition-colors hover:bg-white/[0.02]">
                      <td className={`px-3 py-2 font-mono tabular-nums ${start + i < 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{start + i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <DriverLink href={d.media?.href ?? null}>
                          <div className="flex min-w-0 items-center gap-2">
                            <EntityAvatar imageUrl={d.media?.photoUrl ?? null} name={d.driver} size={26} fit="cover" />
                            {d.team && <EntityAvatar imageUrl={logoByTeam.get(d.team) ?? null} name={d.team} size={14} shape="square" fit="contain" />}
                            <span className="truncate font-medium text-white">{d.driver}</span>
                          </div>
                        </DriverLink>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-white">
                        {d.count} win{d.count !== 1 && "s"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "team" && (
              <table className="w-full text-left text-sm">
                <thead className={HEADER_ROW_CLASS} style={HEADER_STYLE}>
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">#</th>
                    <th className="px-3 py-2.5 font-semibold">Team</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--f1-line)]">
                  {pageTeams.map((t, i) => (
                    <tr key={t.team} className="transition-colors hover:bg-white/[0.02]">
                      <td className={`px-3 py-2 font-mono tabular-nums ${start + i < 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{start + i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <EntityAvatar imageUrl={logoByTeam.get(t.team) ?? null} name={t.team} size={20} shape="square" fit="contain" />
                          <span className="truncate font-medium text-white">{t.team}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-white">
                        {t.count} win{t.count !== 1 && "s"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
