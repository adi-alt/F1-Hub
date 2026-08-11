import { SimulationChart } from "@/components/charts/SimulationChart";
import type { RaceSimulation } from "@/lib/types/race";

export function SimulationPanel({ simulation }: { simulation: RaceSimulation }) {
  const ranked = [...simulation.drivers].sort((a, b) => a.medianPosition - b.medianPosition);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Simulated outcome (10,000-race Monte Carlo)
        </h3>
        <ol className="grid gap-2 sm:grid-cols-2">
          {ranked.map((entry, index) => (
            <li
              key={entry.driver}
              className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2.5"
            >
              <span className="font-semibold text-white">
                {index + 1}. {entry.driver}
                <span className="ml-1.5 font-normal text-neutral-500">median P{entry.medianPosition}</span>
              </span>
              <span className="text-xs text-neutral-500">
                {(entry.p1 * 100).toFixed(0)}% win · {(entry.podium * 100).toFixed(0)}% podium
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Finishing-position distribution
        </h3>
        <SimulationChart drivers={simulation.drivers} />
      </div>
    </div>
  );
}
