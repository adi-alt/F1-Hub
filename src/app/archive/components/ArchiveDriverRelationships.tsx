import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { archiveDriverHref } from "@/lib/routes";

const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

export type DriverRelationship = { driverId: string; name: string; photoUrl: string | null; races: number; wins: number };

/**
 * Every driver who's raced for this team, real counts from this team's own results - not hundreds
 * of driver cards, one compact ranked table (same theme as the rest of this app's tables: sticky
 * translucent header, real photos via EntityAvatar). Sorted by races, since "who drove here the
 * most" is a more useful default ranking for a team's own roster history than win count (most
 * drivers who've ever driven for a given team never won a race for them).
 */
export function ArchiveDriverRelationships({ drivers, maxHeightPx = 320 }: { drivers: DriverRelationship[]; maxHeightPx?: number }) {
  if (drivers.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-[var(--f1-carbon)]/50">
      <div className="overflow-y-auto" style={{ maxHeight: maxHeightPx }}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-white/[0.08] text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md" style={HEADER_STYLE}>
            <tr>
              <th className="px-3 py-2.5 font-semibold">Driver</th>
              <th className="px-3 py-2.5 text-right font-semibold">Races</th>
              <th className="px-3 py-2.5 text-right font-semibold">Wins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--f1-line)]">
            {drivers.map((d) => (
              <tr key={d.driverId} className="transition-colors hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-3 py-2">
                  <Link href={archiveDriverHref(d.driverId)} className="flex min-w-0 items-center gap-2 transition hover:text-white">
                    <EntityAvatar imageUrl={d.photoUrl} name={d.name} size={24} fit="cover" />
                    <span className="truncate font-medium text-neutral-200">{d.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-neutral-400">{d.races}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-white">{d.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
