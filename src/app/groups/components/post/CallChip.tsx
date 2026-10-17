"use client";

import { Check, Clock, Target, X } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown } from "@/lib/countdown";
import { MIN_SETTLED_FOR_RATE } from "@/lib/postCalls";
import type { PostCallView } from "@/lib/supabase/postCalls";

/**
 * A post's call (takes with receipts): what it claims, and where it stands - open until its session starts, then
 * awaiting the result, then graded against the official classification: "Called it" or "Missed" (or void when the
 * result can't settle it, a driver who didn't race). A grade made on a preliminary classification says so.
 */
export function CallChip({ call }: { call: PostCallView }) {
  const now = useMinuteClock();
  const locksAt = Date.parse(call.locksAt);
  const { status, provisional } = call.verdict;
  const tone =
    status === "correct"
      ? "border-success/40 bg-success/[0.08]"
      : status === "incorrect"
        ? "border-white/[0.08] bg-white/[0.02]"
        : "border-white/[0.1] bg-white/[0.03]";
  return (
    <div className={`mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-control border px-3 py-2 ${tone}`}>
      <span className="flex min-w-0 items-center gap-1.5 text-caption">
        <Icon icon={Target} size={16} className={`size-3.5 shrink-0 ${status === "correct" ? "text-success" : "text-tertiary"}`} />
        <span className="font-semibold uppercase tracking-[0.12em] text-tertiary">Call</span>
        <span className={`min-w-0 truncate text-body-sm ${status === "incorrect" ? "text-secondary line-through decoration-white/30" : "font-medium text-primary"}`}>{call.label}</span>
      </span>
      <span suppressHydrationWarning className="ml-auto flex shrink-0 items-center gap-1 text-caption font-medium">
        {status === "correct" ? (
          <span className="flex items-center gap-1 text-success">
            <Icon icon={Check} size={16} className="size-3.5" />
            Called it{provisional ? " (provisional)" : ""}
          </span>
        ) : status === "incorrect" ? (
          <span className="flex items-center gap-1 text-secondary">
            <Icon icon={X} size={16} className="size-3.5" />
            Missed{provisional ? " (provisional)" : ""}
          </span>
        ) : status === "void" ? (
          <span className="text-tertiary">Void</span>
        ) : now < locksAt ? (
          <span className="flex items-center gap-1 text-tertiary">
            <Icon icon={Clock} size={16} className="size-3.5" />
            Locks in {formatCountdown(locksAt, now)}
          </span>
        ) : (
          <span className="text-tertiary">Locked · awaiting result</span>
        )}
      </span>
    </div>
  );
}

/** The author's season record from their calls, next to their name: a hit rate once there are a few settled calls,
 * the count before that. */
export function CallRecordBadge({ record }: { record: { correct: number; settled: number } }) {
  if (record.settled === 0) return null;
  const rate = Math.round((record.correct / record.settled) * 100);
  return (
    <span
      title={`${record.correct} of ${record.settled} calls right this season`}
      className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.05] px-1.5 py-px text-caption tabular text-secondary"
    >
      <Icon icon={Target} size={16} className="size-3" />
      {record.settled >= MIN_SETTLED_FOR_RATE ? `${rate}%` : `${record.correct}/${record.settled}`}
    </span>
  );
}
