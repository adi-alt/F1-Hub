"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import type { PostPollView } from "@/lib/communities";

export function PollCard({
  postId,
  poll: initialPoll,
  disabled = false,
}: {
  postId: string;
  poll: PostPollView;
  disabled?: boolean;
}) {
  const [poll, setPoll] = useState<PostPollView>(initialPoll);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed = poll.closed || disabled;

  async function handleVote(optionId: string) {
    if (isClosed || voting) return;
    setError(null);
    setVoting(true);

    // Optimistic calculation
    const previous = poll;
    const isClearing = poll.myOptionId === optionId;
    const nextMyOption = isClearing ? null : optionId;

    const nextOptions = poll.options.map((opt) => {
      let nextCount = opt.count;
      if (opt.id === poll.myOptionId) nextCount = Math.max(0, nextCount - 1);
      if (!isClearing && opt.id === optionId) nextCount += 1;
      return { ...opt, count: nextCount };
    });
    const nextTotal = nextOptions.reduce((acc, o) => acc + o.count, 0);
    const updatedOptions = nextOptions.map((opt) => ({
      ...opt,
      pct: nextTotal > 0 ? Math.round((opt.count / nextTotal) * 100) : 0,
    }));

    setPoll({
      ...poll,
      options: updatedOptions,
      totalVotes: nextTotal,
      myOptionId: nextMyOption,
    });

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollOptionId: optionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { poll?: PostPollView; error?: string };
      if (!res.ok || !data.poll) {
        setPoll(previous);
        setError(data.error ?? "Failed to cast vote.");
      } else {
        setPoll(data.poll);
      }
    } catch {
      setPoll(previous);
      setError("Network error casting vote.");
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      {poll.question && (
        <p className="mb-2.5 text-body-sm font-semibold text-primary">{poll.question}</p>
      )}

      <div className="space-y-1.5" role="group" aria-label="Poll options">
        {poll.options.map((option) => {
          const isMyPick = option.id === poll.myOptionId;
          const hasVoted = Boolean(poll.myOptionId);
          const showBar = hasVoted || isClosed;

          return (
            <button
              key={option.id}
              type="button"
              disabled={isClosed || voting}
              onClick={() => void handleVote(option.id)}
              aria-pressed={isMyPick}
              className={`relative flex w-full items-center justify-between overflow-hidden rounded-control border px-3 py-2 text-left text-body-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                isMyPick
                  ? "border-brand/40 bg-brand/[0.06] text-primary"
                  : "border-white/[0.07] bg-white/[0.015] text-primary hover:border-white/[0.16] hover:bg-white/[0.04]"
              } ${isClosed ? "cursor-default" : ""}`}
            >
              {showBar && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300 ${
                    isMyPick ? "bg-brand/20" : "bg-white/[0.06]"
                  }`}
                  style={{ width: `${option.pct}%` }}
                />
              )}

              <span className="relative z-10 flex min-w-0 items-center gap-2">
                {isMyPick && (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-control bg-brand text-black">
                    <Icon icon={Check} size={16} className="size-3 stroke-[2.5]" />
                  </span>
                )}
                <span className={`truncate font-medium ${isMyPick ? "text-primary" : "text-primary/90"}`}>
                  {option.label}
                </span>
              </span>

              {showBar && (
                <span className="relative z-10 ml-2 shrink-0 font-mono text-caption tabular-nums text-secondary">
                  {option.pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-caption text-tertiary">
        <span>
          {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1.5">
          {poll.closed && (
            <span className="flex items-center gap-1 text-tertiary">
              <Icon icon={Lock} size={16} className="size-3" />
              Final results
            </span>
          )}
          {!poll.closed && poll.closesAt && (
            <span>
              Closes {new Date(poll.closesAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {!poll.closed && !poll.closesAt && <span>Open poll</span>}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

