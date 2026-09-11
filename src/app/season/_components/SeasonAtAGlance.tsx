import type { DriverStandingRow, ConstructorStandingRow, RaceSummary, Battle } from "../_service/season.pure";
import { computeRecentForm } from "../_service/season.pure";

/** A compact editorial strip - label/name/value stacked per item, separated by thin dividers -
 * instead of four large icon-and-border cards. Same "level 3: small information unit" treatment
 * the standings table's own favorite rows use, not a dashboard metric-card grid. */
export function SeasonAtAGlance({
  drivers,
  races,
  battles,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  races: RaceSummary[];
  battles: Battle[];
}) {
  const driverLeader = drivers[0];
  const driverChallenger = drivers[1];

  // Best form: highest points across the last 5 completed rounds.
  let bestFormDriver = driverLeader;
  let maxFormPoints = -1;
  for (const d of drivers) {
    const form = computeRecentForm(d.driver, races, false);
    if (form.totalPoints > maxFormPoints) {
      maxFormPoints = form.totalPoints;
      bestFormDriver = d;
    }
  }

  const tightestBattle = battles[0];

  const items = [
    { label: "Leader", name: driverLeader?.driverName ?? "-", value: driverLeader ? `${driverLeader.points} pts` : null },
    {
      label: "Chaser",
      name: driverChallenger?.driverName ?? "-",
      value: driverChallenger && driverLeader ? `-${driverLeader.points - driverChallenger.points} pts` : null,
    },
    { label: "Form", name: bestFormDriver?.driverName ?? "-", value: maxFormPoints >= 0 ? `${maxFormPoints} pts · last 5` : null },
    {
      label: "Battle",
      name: tightestBattle ? `${tightestBattle.aId} ↔ ${tightestBattle.bId}` : "-",
      value: tightestBattle ? (tightestBattle.gap === 0 ? "Level" : `${tightestBattle.gap} pt gap`) : null,
    },
  ];

  return (
    <div className="mb-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Season snapshot</p>
      <div className="mt-2 h-px w-full bg-white/[0.06]" />
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-white/[0.06]">
        {items.map((item) => (
          <div key={item.label} className="sm:px-4 sm:first:pl-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{item.name}</p>
            {item.value && <p className="mt-0.5 text-xs text-neutral-500">{item.value}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
