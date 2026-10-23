"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { EYEBROW } from "@/components/ui/panel";
import { Table, type TableColumn } from "@/components/ui/Table";
import type { ScorecardRow, SeasonScorecard as Scorecard } from "@/lib/seasonScorecard";

type Row = ScorecardRow & { href: string };

const pts = (n: number | null) => (n === null ? "–" : String(n));

/**
 * The season scorecard (R-63): per race, your pick against the model's, the community's most-picked winner and
 * who actually won, with the points each scored. Points are the leaderboards' own (scorePick), so the total here
 * is the total there.
 */
export function SeasonScorecard({ season, scorecard, names, rows }: { season: number; scorecard: Scorecard; names: Record<string, string>; rows: Row[] }) {
  const name = (code: string | null) => (code ? (names[code] ?? code) : "–");
  const { totals } = scorecard;
  const columns: TableColumn<Row>[] = [
    { key: "round", header: "Rd", numeric: true, sortable: true, firstSortDirection: "ascending", width: "3.5rem" },
    {
      key: "raceName",
      header: "Race",
      sortable: true,
      render: (r) => (
        <Link href={r.href} className="rounded-control text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {r.raceName.replace(/ Grand Prix$/, "")}
        </Link>
      ),
    },
    { key: "yourWinner", header: "Your pick", render: (r) => (r.yourWinner ? name(r.yourWinner) : <span className="text-tertiary">No pick</span>) },
    { key: "modelWinner", header: "Model", hideBelow: "md", render: (r) => name(r.modelWinner) },
    {
      key: "consensusWinner",
      header: "Community",
      hideBelow: "md",
      render: (r) => (r.consensusWinner ? `${name(r.consensusWinner)} · ${Math.round((r.consensusShare ?? 0) * 100)}%` : "–"),
    },
    { key: "actualWinner", header: "Winner", render: (r) => (r.status === "pending" ? <span className="text-tertiary">To come</span> : name(r.actualWinner)) },
    { key: "yourPoints", header: "Your pts", numeric: true, sortable: true, render: (r) => pts(r.yourPoints) },
    { key: "modelPoints", header: "Model pts", numeric: true, hideBelow: "sm", render: (r) => pts(r.modelPoints) },
    { key: "communityAverage", header: "Avg pts", numeric: true, hideBelow: "sm", render: (r) => pts(r.communityAverage) },
  ];

  return (
    <section aria-labelledby="season-scorecard" className="space-y-5">
      <h2 id="season-scorecard" className={EYEBROW}>
        Your {season} picks
      </h2>
      {rows.length === 0 ? (
        <EmptyState message="No race picks yet this season. Make one on the next race's page and it shows here, scored once the race is run." boxed />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              { label: "Pick points", value: String(totals.yourPoints), detail: `${totals.racesScored} race${totals.racesScored === 1 ? "" : "s"} scored` },
              { label: "Winners right", value: `${totals.winnersRight}/${totals.racesScored}` },
              { label: "Model's points", value: String(totals.modelPoints), detail: "same races" },
              { label: "Beat the model", value: `${totals.beatModel}/${totals.racesScored}` },
            ].map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-caption text-tertiary">{f.label}</dt>
                <dd className="mt-0.5 text-title-md tabular text-primary">{f.value}</dd>
                {f.detail && <dd className="text-caption text-secondary">{f.detail}</dd>}
              </div>
            ))}
          </dl>
          <Table caption={`Your ${season} picks by race`} columns={columns} rows={rows} getRowKey={(r) => r.raceId} defaultSort={{ key: "round", direction: "ascending" }} density="compact" />
          <p className="text-caption text-secondary">
            Scored by the community leaderboards&apos; rules, so these totals are the ones they rank you on. Model points are what the race model&apos;s own call would have scored.
          </p>
        </>
      )}
    </section>
  );
}
