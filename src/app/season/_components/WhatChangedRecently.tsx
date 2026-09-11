import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from "lucide-react";
import type { DriverStandingRow, ConstructorStandingRow } from "../_service/season.pure";
import { computePositionChanges } from "../_service/season.pure";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";

export function WhatChangedRecently({
  drivers,
  constructors,
  progression,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string | null>[];
}) {
  const { intelligence } = useSeasonIntelligence();
  const changes = computePositionChanges(drivers, constructors, progression);
  
  if (progression.length < 2) {
    return (
      <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl p-6 text-center text-[var(--f1-text-muted)]">
        No changes to display yet. This is the opening round of the season.
      </div>
    );
  }

  // Filter out drivers who didn't change position or points significantly? Or just show top movers.
  const movers = changes.drivers.filter(d => (d.positionDelta && d.positionDelta !== 0) || (d.pointsDelta && d.pointsDelta > 10)).sort((a, b) => Math.abs(b.positionDelta || 0) - Math.abs(a.positionDelta || 0)).slice(0, 5);

  if (movers.length === 0) {
    return (
      <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl p-6 text-center text-[var(--f1-text-muted)]">
        The standings remained unchanged after the latest round.
      </div>
    );
  }

  return (
    <div className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl overflow-hidden">
      <div className="p-4 bg-[var(--f1-muted)] border-b border-[var(--f1-border)]">
        <h3 className="font-bold text-[var(--f1-text)] uppercase tracking-wide">What Changed Recently</h3>
      </div>
      
      {intelligence?.whatChangedInsight && (
        <div className="p-4 border-b border-[var(--f1-border)] bg-[var(--f1-card)]">
          <p className="text-[var(--f1-text-muted)] text-sm">{intelligence.whatChangedInsight.summary}</p>
        </div>
      )}

      <div className="divide-y divide-[var(--f1-border)]">
        {movers.map(mover => {
          const driver = drivers.find(d => d.driver === mover.entityId);
          if (!driver) return null;
          
          const isUp = (mover.positionDelta || 0) > 0;
          const isDown = (mover.positionDelta || 0) < 0;
          
          return (
            <div key={mover.entityId} className="p-4 flex items-center justify-between hover:bg-[var(--f1-muted)] transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--f1-card)] border border-[var(--f1-border)] font-bold text-sm">
                  {mover.currentPosition}
                </div>
                <div>
                  <p className="font-bold text-[var(--f1-text)]">{driver.driverName}</p>
                  <p className="text-xs text-[var(--f1-text-muted)]">+{mover.pointsDelta} points</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {isUp && <ArrowUpIcon className="w-5 h-5 text-green-500" />}
                {isDown && <ArrowDownIcon className="w-5 h-5 text-red-500" />}
                {!isUp && !isDown && <MinusIcon className="w-5 h-5 text-gray-500" />}
                <span className={`font-bold \${isUp ? "text-green-500" : isDown ? "text-red-500" : "text-gray-500"}`}>
                  {Math.abs(mover.positionDelta || 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
