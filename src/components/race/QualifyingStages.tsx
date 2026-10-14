"use client";

import { useState } from "react";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { formatLapTime } from "@/lib/format";
import type { QualifyingStageRow } from "@/lib/supabase/races";

type View = "final" | "1" | "2" | "3";

/**
 * Qualifying, stage by stage: the final order, then each knockout stage (Q1/Q2/Q3, or SQ1/SQ2/SQ3) with its own
 * times and who went out there. Gaps are always within one stage - a Q1 lap is never compared with a Q3 one. Only
 * real times are shown: a stage a driver didn't reach, or had no valid lap in, reads "–". The final order is the
 * qualifying result, which is not always the starting grid (penalties): when the official grid is known and differs,
 * it's shown beside it.
 */
export function QualifyingStages({ rows, session, grid }: { rows: QualifyingStageRow[]; session: "Q" | "SQ"; grid?: Map<string, number | null> }) {
  const prefix = session === "SQ" ? "SQ" : "Q";
  const stagesRun = ([1, 2, 3] as const).filter((n) => rows.some((r) => r.stages[n - 1] !== null));
  const [view, setView] = useState<View>("final");
  const sorted = [...rows].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const official = rows.every((r) => r.source === "official");
  const gridDiffers = !!grid && sorted.some((r) => grid.get(r.driver) != null && grid.get(r.driver) !== r.position);

  const outIn = (r: QualifyingStageRow) => (r.status === "dsq" ? "Disqualified" : r.status === "dns" ? "Did not start" : r.stageReached < Math.max(...stagesRun, 1) ? `Out in ${prefix}${r.stageReached}` : null);
  const pole = sorted.find((r) => r.position === 1);
  const poleTime = pole ? pole.stages[pole.stageReached - 1] : null;

  const finalColumns: TableColumn<QualifyingStageRow>[] = [
    { key: "position", header: "Pos", numeric: true, width: "3.5rem", render: (r) => r.position ?? <span className="text-tertiary">–</span> },
    { key: "driver", header: "Driver", render: (r) => <DriverIdentity code={r.driver} name={r.driverName} team={r.team} /> },
    { key: "team", header: "Team", hideBelow: "md", render: (r) => <span className="text-secondary">{r.team}</span> },
    {
      key: "best",
      header: "Best",
      align: "end",
      numeric: true,
      render: (r) => {
        const t = r.stages[r.stageReached - 1];
        return t !== null ? formatLapTime(t) : <span className="text-tertiary">No time</span>;
      },
    },
    {
      key: "gap",
      header: "Gap to pole",
      align: "end",
      numeric: true,
      render: (r) => {
        // Only like for like: a gap to pole only for cars that ran in the final stage.
        const out = outIn(r);
        if (out) return <span className="text-tertiary">{out}</span>;
        const t = r.stages[r.stageReached - 1];
        if (t === null || poleTime === null) return <span className="text-tertiary">–</span>;
        return r.position === 1 ? <span className="text-primary">Pole</span> : <span className="text-secondary">+{(t - poleTime).toFixed(3)}s</span>;
      },
    },
    ...(gridDiffers
      ? [{ key: "grid", header: "Starts", align: "end" as const, numeric: true, render: (r: QualifyingStageRow) => {
          const g = grid!.get(r.driver);
          return g == null ? <span className="text-tertiary">–</span> : <span className={g !== r.position ? "text-warning" : "text-secondary"}>{g === 0 ? "Pit lane" : `P${g}`}</span>;
        } }]
      : []),
  ];

  const stageView = (n: 1 | 2 | 3) => {
    const inStage = rows.filter((r) => r.stageReached >= n);
    const timed = inStage.filter((r) => r.stages[n - 1] !== null).sort((a, b) => a.stages[n - 1]! - b.stages[n - 1]!);
    const untimed = inStage.filter((r) => r.stages[n - 1] === null);
    const best = timed[0]?.stages[n - 1] ?? null;
    const lastStage = n === Math.max(...stagesRun);
    const ranked = [...timed, ...untimed].map((r, i) => ({ ...r, rank: r.stages[n - 1] === null ? null : i + 1 }));
    const columns: TableColumn<(typeof ranked)[number]>[] = [
      { key: "rank", header: "#", numeric: true, width: "3rem", render: (r) => r.rank ?? <span className="text-tertiary">–</span> },
      { key: "driver", header: "Driver", render: (r) => <DriverIdentity code={r.driver} name={r.driverName} team={r.team} /> },
      { key: "time", header: `${prefix}${n} time`, align: "end", numeric: true, render: (r) => (r.stages[n - 1] !== null ? formatLapTime(r.stages[n - 1]!) : <span className="text-tertiary">No time</span>) },
      { key: "gap", header: "Gap", align: "end", numeric: true, render: (r) => (r.stages[n - 1] === null || best === null ? <span className="text-tertiary">–</span> : r.rank === 1 ? <span className="text-primary">Fastest</span> : <span className="text-secondary">+{(r.stages[n - 1]! - best).toFixed(3)}s</span>) },
      {
        key: "status",
        header: lastStage ? "" : "Result",
        align: "end",
        render: (r) => (lastStage ? null : r.stageReached > n ? <span className="text-secondary">Through</span> : <span className="font-medium text-warning">Out</span>),
      },
    ];
    return <Table caption={`${prefix}${n}`} columns={columns} rows={ranked} getRowKey={(r) => r.driver} rowHeader="driver" stickyFirstColumn density="compact" />;
  };

  const items = [{ value: "final", label: "Final order" }, ...stagesRun.map((n) => ({ value: String(n), label: `${prefix}${n}` }))];
  return (
    <div>
      <Tabs variant="segmented" value={view} onValueChange={(v) => setView(v as View)} items={items}>
        <TabList aria-label={`${session === "SQ" ? "Sprint qualifying" : "Qualifying"} stages`} className="mb-4" />
        <TabPanels>
          {view === "final" ? (
            <Table caption={session === "SQ" ? "Sprint qualifying result" : "Qualifying result"} columns={finalColumns} rows={sorted} getRowKey={(r) => r.driver} rowHeader="driver" stickyFirstColumn density="compact" />
          ) : (
            stageView(Number(view) as 1 | 2 | 3)
          )}
        </TabPanels>
      </Tabs>
      <ProvenanceLine
        className="mt-3"
        source={official ? "Official classification" : "F1 live timing (OpenF1)"}
        status={official ? undefined : session === "SQ" ? "sprint qualifying has no other source; not the FIA's published document" : "preliminary, replaced by the official classification once published"}
      />
      {gridDiffers && <p className="mt-1 text-caption text-tertiary">&ldquo;Starts&rdquo; is the official starting grid, after any penalties.</p>}
    </div>
  );
}
