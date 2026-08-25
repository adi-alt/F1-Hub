import type { RaceInputEntry } from "@/lib/types/race";

/** The qualifying grid a race's own predictions/pick form already depend on (`race.inputs`), just
 * finally given its own visible section — previously only ever consumed indirectly (PickPanel's
 * driver dropdown), never rendered as a real results table. */
export function QualifyingTable({ inputs }: { inputs: RaceInputEntry[] }) {
  const sorted = [...inputs].sort((a, b) => a.grid - b.grid);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--f1-carbon)] text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2.5">Grid</th>
            <th className="px-4 py-2.5">Driver</th>
            <th className="px-4 py-2.5">Team</th>
            <th className="px-4 py-2.5 text-right">Gap to pole</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--f1-line)]">
          {sorted.map((r) => (
            <tr key={r.driver} className="transition hover:bg-white/[0.05]">
              <td className="px-4 py-2.5 font-semibold text-white">{r.grid}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-white">
                {r.driverName} <span className="text-neutral-500">{r.driver}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{r.team}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">
                {r.grid === 1 ? "—" : r.qualifyingGapSec != null ? `+${r.qualifyingGapSec.toFixed(3)}s` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
