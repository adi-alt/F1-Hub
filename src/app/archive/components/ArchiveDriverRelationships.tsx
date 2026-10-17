import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { archiveDriverHref } from "@/lib/routes";

export type DriverRelationship = { driverId: string; name: string; photoUrl: string | null; races: number; wins: number };

/**
 * Every driver who's raced for this team, real counts from this team's own results - not hundreds
 * of driver cards, one compact ranked table (same theme as the rest of this app's tables: sticky
 * translucent header, real photos via EntityAvatar). Sorted by races, since "who drove here the
 * most" is a more useful default ranking for a team's own roster history than win count (most
 * drivers who've ever driven for a given team never won a race for them).
 */
export function ArchiveDriverRelationships({ drivers, maxHeightPx = 360 }: { drivers: DriverRelationship[]; maxHeightPx?: number }) {
  if (drivers.length === 0) return null;
  return (
    <div className={`overflow-hidden ${PANEL}`}>
      <div className="overflow-y-auto scrollbar-subtle" style={{ maxHeight: maxHeightPx }}>
        <table className="w-full text-left text-body-sm">
          <thead className={`sticky top-0 z-10 border-b border-white/[0.06] bg-surface-0/90 backdrop-blur-md ${EYEBROW}`}>
            <tr>
              <th className="px-4 py-3 font-semibold">Driver</th>
              <th className="px-4 py-3 text-right font-semibold">Races</th>
              <th className="px-4 py-3 text-right font-semibold">Wins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {drivers.map((d) => (
              <tr key={d.driverId} className="transition-colors duration-fast hover:bg-white/[0.025]">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Link href={archiveDriverHref(d.driverId)} className="flex min-w-0 items-center gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-focus-ring">
                    <EntityAvatar imageUrl={d.photoUrl} name={d.name} size={28} fit="cover" />
                    <span className="truncate font-medium text-primary underline-offset-4 hover:underline">{d.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular text-secondary">{d.races}</td>
                <td className={`px-4 py-2.5 text-right tabular ${d.wins > 0 ? "font-semibold text-primary" : "text-tertiary"}`}>{d.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
