import { TrophyIcon, TrendingUpIcon, SwordsIcon, TargetIcon } from "lucide-react";
import type { DriverStandingRow, ConstructorStandingRow, RaceSummary, Battle } from "../_service/season.service";
import { computeRecentForm } from "../_service/season.service";

export function SeasonAtAGlance({
  drivers,
  constructors,
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
  
  // Best form: Highest points in last 5 rounds
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Leader */}
      <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl p-4 flex items-center gap-4 hover:border-[var(--f1-accent)] transition-colors cursor-pointer">
        <div className="w-12 h-12 rounded-full bg-[var(--f1-muted)] flex items-center justify-center flex-shrink-0">
          <TrophyIcon className="w-6 h-6 text-yellow-500" />
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-[var(--f1-text-muted)]">Leader</p>
          <p className="font-bold text-[var(--f1-text)] text-lg leading-tight">{driverLeader?.driverName ?? "N/A"}</p>
          <p className="text-sm text-[var(--f1-accent)] font-semibold">{driverLeader?.points ?? 0} PTS</p>
        </div>
      </div>

      {/* Challenger */}
      <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl p-4 flex items-center gap-4 hover:border-[var(--f1-accent)] transition-colors cursor-pointer">
        <div className="w-12 h-12 rounded-full bg-[var(--f1-muted)] flex items-center justify-center flex-shrink-0">
          <TargetIcon className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-[var(--f1-text-muted)]">Challenger</p>
          <p className="font-bold text-[var(--f1-text)] text-lg leading-tight">{driverChallenger?.driverName ?? "N/A"}</p>
          <p className="text-sm text-[var(--f1-accent)] font-semibold">{driverChallenger ? (driverLeader.points - driverChallenger.points) : 0} PTS BEHIND</p>
        </div>
      </div>

      {/* Best Form */}
      <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl p-4 flex items-center gap-4 hover:border-[var(--f1-accent)] transition-colors cursor-pointer">
        <div className="w-12 h-12 rounded-full bg-[var(--f1-muted)] flex items-center justify-center flex-shrink-0">
          <TrendingUpIcon className="w-6 h-6 text-green-500" />
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-[var(--f1-text-muted)]">Best Form</p>
          <p className="font-bold text-[var(--f1-text)] text-lg leading-tight">{bestFormDriver?.driverName ?? "N/A"}</p>
          <p className="text-sm text-[var(--f1-accent)] font-semibold">{maxFormPoints} PTS IN L5</p>
        </div>
      </div>

      {/* Tightest Battle */}
      <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl p-4 flex items-center gap-4 hover:border-[var(--f1-accent)] transition-colors cursor-pointer">
        <div className="w-12 h-12 rounded-full bg-[var(--f1-muted)] flex items-center justify-center flex-shrink-0">
          <SwordsIcon className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <p className="text-xs uppercase font-semibold text-[var(--f1-text-muted)]">Tightest Battle</p>
          <p className="font-bold text-[var(--f1-text)] text-lg leading-tight truncate w-full pr-2" title={tightestBattle ? `${tightestBattle.aLabel} vs ${tightestBattle.bLabel}` : "N/A"}>
            {tightestBattle ? `${tightestBattle.aId} vs ${tightestBattle.bId}` : "N/A"}
          </p>
          <p className="text-sm text-[var(--f1-accent)] font-semibold">{tightestBattle?.gap ?? 0} PTS DIFFERENCE</p>
        </div>
      </div>
    </div>
  );
}
