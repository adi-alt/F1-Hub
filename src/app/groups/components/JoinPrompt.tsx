"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import type { GroupPreview, JoinRequestStatus } from "@/lib/supabase/groups";
import { GroupBanner } from "./GroupBanner";

/**
 * What a signed-in visitor sees for a community they're not in yet - enough preview to decide
 * whether to join, and nothing that isn't safe to show a non-member (getGroupPreview decides that,
 * not this component).
 *
 * Three genuinely different doors, which is the whole reason this got rebuilt:
 *
 *   public   - Join, immediately
 *   private  - Request to Join, with an optional note, then a waiting state
 *   rejected - says so plainly, and lets them ask again rather than silently doing nothing
 *
 * Arriving here at all means having the link. For a private community the link is not the key any
 * more - approval is.
 */
export function JoinPrompt({ group, joinRequestStatus }: { group: GroupPreview; joinRequestStatus: JoinRequestStatus | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const [requestState, setRequestState] = useState<JoinRequestStatus | null>(joinRequestStatus);
  const [message, setMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);

  const isPublic = group.visibility === "public";
  const meta = communityTypeMeta(group.communityType);

  async function join() {
    setStatus("working");
    setError("");
    const res = await fetch(`/api/groups/${group.id}/join`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't join this community.");
      setStatus("error");
      return;
    }
    router.refresh();
  }

  async function request() {
    setStatus("working");
    setError("");
    const res = await fetch(`/api/groups/${group.id}/join-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() || undefined }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { status?: JoinRequestStatus; error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't send your request.");
      setStatus("error");
      return;
    }
    setRequestState("pending");
    setStatus("idle");
  }

  async function withdraw() {
    setStatus("working");
    await fetch(`/api/groups/${group.id}/join-requests`, { method: "DELETE" }).catch(() => {});
    setRequestState(null);
    setShowMessage(false);
    setMessage("");
    setStatus("idle");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]">
      <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} />

      <div className="px-6 pb-7 text-center">
        <div className="-mt-8 flex justify-center">
          <span className="rounded-full ring-4 ring-[var(--f1-carbon)]">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={64} />
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-white">{group.name}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          {meta.label} · {visibilityLabel(group.visibility)}
          {group.topic ? ` · ${group.topic}` : ""}
        </p>
        {group.description && <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-400">{group.description}</p>}
        <p className="mt-3 text-xs text-neutral-500">
          {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
        </p>

        <div className="mt-6">
          {isPublic ? (
            <button
              onClick={() => void join()}
              disabled={status === "working"}
              className="rounded-full bg-[var(--f1-red)] px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {status === "working" ? "Joining…" : "Join Community"}
            </button>
          ) : requestState === "pending" ? (
            <div>
              <p className="text-sm font-medium text-neutral-200">Request sent</p>
              <p className="mt-1 text-xs text-neutral-500">An admin will review it. You&apos;ll get in as soon as they approve.</p>
              <button onClick={() => void withdraw()} disabled={status === "working"} className="mt-3 text-xs text-neutral-500 transition hover:text-white disabled:opacity-50">
                Withdraw request
              </button>
            </div>
          ) : requestState === "rejected" ? (
            <div>
              {/* Said plainly rather than leaving a button that silently does nothing. */}
              <p className="text-sm font-medium text-neutral-200">Your request wasn&apos;t approved.</p>
              <button
                onClick={() => void request()}
                disabled={status === "working"}
                className="mt-3 rounded-full border border-[var(--f1-line)] px-5 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 disabled:opacity-50"
              >
                Ask again
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-sm">
              {showMessage && (
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  autoFocus
                  placeholder="Tell them why you'd like to join (optional)"
                  aria-label="Message to the admins"
                  className="mb-3 w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-left text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
              )}
              <button
                onClick={() => void request()}
                disabled={status === "working"}
                className="rounded-full bg-[var(--f1-red)] px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {status === "working" ? "Sending…" : "Request to Join"}
              </button>
              {!showMessage && (
                <button onClick={() => setShowMessage(true)} className="mt-2 block w-full text-xs text-neutral-500 transition hover:text-neutral-300">
                  Add a message
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-[var(--f1-red)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
