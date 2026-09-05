"use client";

import { PickVsModel } from "../PickVsModel";
import type { RaceDoc, UserPick } from "@/lib/types/race";
import type { PredictionPoll } from "@/lib/homePredictionPolls";

export function YouVsCommunityVsModel({
  myPick,
  nextRace,
  poll,
}: {
  myPick: UserPick | null;
  nextRace: RaceDoc | null;
  poll?: PredictionPoll | null;
}) {
  if (!myPick || !nextRace) return null;

  return (
    <div className="space-y-4">
      <PickVsModel myPick={myPick} nextRace={nextRace} />

      {poll && poll.options && poll.options.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Community Poll Consensus
          </p>
          <p className="mt-1 text-xs text-neutral-300 font-medium">
            {poll.groupName} · {poll.typeLabel}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {poll.options.map((opt) => (
              <div
                key={opt.label}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.05] bg-black/30 px-2.5 py-1 text-xs"
              >
                <span className="font-semibold text-white">{opt.label}:</span>
                <span className="font-mono text-neutral-400">{opt.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
