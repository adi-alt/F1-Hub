"use client";

import { Typewriter } from "@/components/motion/Typewriter";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { ProbabilityMeter } from "@/components/ui/ProbabilityMeter";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Table, type TableColumn } from "@/components/ui/Table";
import { teamColor } from "@/lib/teamColors";
import type { RacePrediction, RaceSimulation, SimulatedDriverEntry } from "@/lib/types/race";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const TABLE_ROWS = 10;

function generatedLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  // en-GB and UTC so the server and every browser print the same date (no hydration mismatch).
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Norris is the favourite: 44% to win, 81% to make the podium." The answer, before any chart (spec P10). */
export function outlookHeadline(drivers: readonly SimulatedDriverEntry[], nameOf: (code: string) => string): string | null {
  const [first, second] = [...drivers].sort((a, b) => b.p1 - a.p1);
  if (!first) return null;
  const lead = `${nameOf(first.driver)} is the favourite: ${pct(first.p1)} to win, ${pct(first.podium)} to make the podium`;
  // "Clear" only when the margin to the next driver is real, so a coin flip never reads as a certainty.
  if (second && first.p1 - second.p1 < 0.05) return `${lead}, with ${nameOf(second.driver)} close behind on ${pct(second.p1)}.`;
  return `${lead}.`;
}

/**
 * What the model expects, answer first (spec §3.5): a one-line headline, one probability meter for the win,
 * then the detail as a table, and where the numbers came from. Falls back to the predicted finishing order
 * when only that exists (no simulation yet).
 */
export function ModelOutlook({ simulation, prediction, nameOf }: { simulation?: RaceSimulation | null; prediction?: RacePrediction | null; nameOf: (code: string) => string }) {
  if (simulation?.drivers.length) {
    const rows = [...simulation.drivers].sort((a, b) => b.p1 - a.p1 || a.medianPosition - b.medianPosition).slice(0, TABLE_ROWS);
    const columns: TableColumn<SimulatedDriverEntry>[] = [
      { key: "driver", header: "Driver", render: (d) => <DriverIdentity code={d.driver} name={nameOf(d.driver)} team={d.team} /> },
      { key: "medianPosition", header: "Likely finish", align: "end", numeric: true, render: (d) => `P${Math.round(d.medianPosition)}` },
      { key: "p1", header: "Win", align: "end", numeric: true, render: (d) => pct(d.p1) },
      { key: "podium", header: "Podium", align: "end", numeric: true, render: (d) => pct(d.podium) },
      { key: "top5", header: "Top 5", align: "end", numeric: true, hideBelow: "sm", render: (d) => <span className="text-secondary">{pct(d.top5)}</span> },
    ];
    return (
      <div className="space-y-5">
        <p className="text-body text-primary">
          <Typewriter text={outlookHeadline(simulation.drivers, nameOf) ?? ""} />
        </p>
        <ProbabilityMeter caption="Chance of winning" entries={simulation.drivers.map((d) => ({ label: d.driver, value: d.p1, color: teamColor(d.team) }))} />
        <Table caption="Model outlook by driver" columns={columns} rows={rows} getRowKey={(d) => d.driver} density="compact" />
        <ProvenanceLine source={`Apex model ${simulation.modelVersion}`} status={`10,000 simulated races, frozen ${generatedLabel(simulation.generatedAt) ?? "after qualifying"}`} />
      </div>
    );
  }

  if (prediction?.finishOrder.length) {
    const order = [...prediction.finishOrder].sort((a, b) => a.predictedPosition - b.predictedPosition).slice(0, TABLE_ROWS);
    return (
      <div className="space-y-4">
        <p className="text-body text-primary">The model expects {nameOf(order[0].driver)} to win.</p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {order.map((o) => (
            <li key={o.driver} className="flex items-center gap-3 text-body-sm">
              <span className="w-7 text-end tabular text-tertiary">P{o.predictedPosition}</span>
              <DriverIdentity code={o.driver} name={nameOf(o.driver)} team={o.team} />
            </li>
          ))}
        </ol>
        <ProvenanceLine source={`Apex model ${prediction.modelVersion}`} status={`predicted order, frozen ${generatedLabel(prediction.generatedAt) ?? "after qualifying"}`} />
      </div>
    );
  }

  return null;
}
