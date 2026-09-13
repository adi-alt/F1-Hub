import Link from "next/link";
import { groupHref } from "@/lib/routes";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PredictionPoll } from "@/lib/homePredictionPolls";

/** Real poll-bar breakdowns of the group predictions the user's own communities have made in the
 * last ~7 days — see homePredictionPolls.ts: every bar's % comes from actual
 * group_prediction_entries rows, never a fabricated split. Visually distinct from the plain-list
 * PostCard feed next to it — this reads as a poll, not another post. */
export function PredictionPolls({ polls }: { polls: PredictionPoll[] }) {
  if (polls.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Latest prediction polls</p>
      </div>
      <div className="mt-3 space-y-4">
        {polls.map((poll) => (
          <Link key={poll.id} href={groupHref(poll.groupId)} className="block rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5 transition hover:border-white/30">
            <p className="text-xs text-neutral-500">
              {poll.groupName} · {poll.typeLabel} · {poll.raceName}
            </p>
            {poll.totalEntries === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No entries yet, be the first to predict.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {poll.options.map((opt) => (
                  <div key={opt.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">{opt.label}</span>
                      <span className="text-neutral-400">{opt.pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${opt.pct}%`, background: "var(--f1-red)" }} />
                    </div>
                  </div>
                ))}
                <p className="pt-0.5 text-[11px] text-neutral-600">
                  {poll.totalEntries} entr{poll.totalEntries === 1 ? "y" : "ies"}
                </p>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PredictionPollsSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-4">
      <Skeleton className="skeleton-shimmer h-3 w-32 rounded" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="skeleton-shimmer h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
