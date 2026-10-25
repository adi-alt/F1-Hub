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

/** Below this chance of winning nobody is called the favourite: with ~20 cars, a few percent is an open race. */
const FAVOURITE_MIN_WIN = 0.2;
/** And the leader must be clear of the next driver by this much. */
const FAVOURITE_MIN_MARGIN = 0.05;

/** One driver's outlook, every figure but the win read from the same simulated finishing distribution, so they
 * agree with each other: the stored podium chance is separately calibrated and can exceed the top-5 chance, or sit
 * at 64% beside a likely finish of P5. Win stays the calibrated figure (it's the one the benchmark checks). */
export function driverOutlook(d: SimulatedDriverEntry): { win: number; podium: number; top5: number; likely: number } {
  const pp = d.positionProbabilities ?? [];
  if (pp.length < 5) return { win: d.p1, podium: Math.max(d.podium, d.p1), top5: Math.max(d.top5, d.podium), likely: Math.round(d.medianPosition) };
  const sum = (n: number) => pp.slice(0, n).reduce((a, b) => a + b, 0);
  let cum = 0;
  let likely = pp.length;
  for (let i = 0; i < pp.length; i++) {
    cum += pp[i];
    if (cum >= 0.5) {
      likely = i + 1;
      break;
    }
  }
  const podium = Math.max(sum(3), d.p1);
  return { win: d.p1, podium, top5: Math.max(sum(5), podium), likely };
}

/** The answer before any chart (spec P10): "Norris is the favourite: 44% to win, 81% to make the podium." When the
 * win chances are nearly flat it says so instead of crowning someone on 6%. */
export function outlookHeadline(drivers: readonly SimulatedDriverEntry[], nameOf: (code: string) => string): string | null {
  const [first, second] = [...drivers].sort((a, b) => b.p1 - a.p1);
  if (!first) return null;
  const clear = first.p1 >= FAVOURITE_MIN_WIN && (!second || first.p1 - second.p1 >= FAVOURITE_MIN_MARGIN);
  if (clear) {
    const o = driverOutlook(first);
    return `${nameOf(first.driver)} is the favourite: ${pct(o.win)} to win, ${pct(o.podium)} to make the podium.`;
  }
  const [bestPodium] = [...drivers].map((d) => ({ d, o: driverOutlook(d) })).sort((a, b) => b.o.podium - a.o.podium);
  return `The model sees an open race: no driver is better than ${pct(first.p1)} to win. ${nameOf(bestPodium.d.driver)} is the likeliest to finish on the podium, at ${pct(bestPodium.o.podium)}.`;
}

/**
 * What the model expects, answer first (spec §3.5): a one-line headline, one probability meter for the win,
 * then the detail as a table, and where the numbers came from. Falls back to the predicted finishing order
 * when only that exists (no simulation yet).
 */
export function ModelOutlook({ simulation, prediction, nameOf }: { simulation?: RaceSimulation | null; prediction?: RacePrediction | null; nameOf: (code: string) => string }) {
  if (simulation?.drivers.length) {
    type Row = SimulatedDriverEntry & { o: ReturnType<typeof driverOutlook> };
    const rows: Row[] = simulation.drivers
      .map((d) => ({ ...d, o: driverOutlook(d) }))
      .sort((a, b) => b.p1 - a.p1 || b.o.podium - a.o.podium || a.o.likely - b.o.likely)
      .slice(0, TABLE_ROWS);
    const columns: TableColumn<Row>[] = [
      { key: "driver", header: "Driver", render: (d) => <DriverIdentity code={d.driver} name={nameOf(d.driver)} team={d.team} /> },
      { key: "medianPosition", header: "Likely finish", align: "end", numeric: true, render: (d) => `P${d.o.likely}` },
      { key: "p1", header: "Win", align: "end", numeric: true, render: (d) => pct(d.o.win) },
      { key: "podium", header: "Podium", align: "end", numeric: true, render: (d) => pct(d.o.podium) },
      { key: "top5", header: "Top 5", align: "end", numeric: true, hideBelow: "sm", render: (d) => <span className="text-secondary">{pct(d.o.top5)}</span> },
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
