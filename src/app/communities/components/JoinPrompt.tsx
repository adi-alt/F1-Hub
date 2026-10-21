"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import type { GroupPreview, InviteState, JoinRequestStatus } from "@/lib/supabase/groups";
import { GroupBanner } from "./GroupBanner";
import { groupHref } from "@/lib/routes";

/**
 * What a signed-in visitor sees for a community they're not in yet - enough preview to decide
 * whether to join, and nothing that isn't safe to show a non-member (getGroupPreview decides that,
 * not this component).
 *
 * Three genuinely different doors, which is the whole reason this got rebuilt:
 *
 *   public   - Join, immediately
 *   private  - Request to Join, with an optional note, then a waiting state
 *   hidden   - invite-only: no request, just how to get in
 *   invited  - a private or hidden community reached through a valid, signed invitation link: Accept invitation
 *   rejected - says so plainly, and lets them ask again
 *   banned   - says so, with nothing to click that the server would refuse
 *
 * Knowing the community's link is not the key to a private community - approval or a valid
 * invitation is, and the server enforces that (joinGroup), whatever this component shows. An
 * invitation that has expired, been cancelled or been used up is said so plainly rather than
 * offering a Join that would fail.
 */
export function JoinPrompt({
  group,
  joinRequestStatus,
  inviteToken = null,
  inviteState = null,
  banned = false,
}: {
  group: GroupPreview;
  joinRequestStatus: JoinRequestStatus | null;
  /** A token the server has already checked is valid; null when there isn't one. */
  inviteToken?: string | null;
  inviteState?: InviteState | null;
  banned?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const [requestState, setRequestState] = useState<JoinRequestStatus | null>(joinRequestStatus);
  const [message, setMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);

  const isPublic = group.visibility === "public";
  const inviteOnly = group.visibility === "hidden";
  const invited = !isPublic && !!inviteToken;
  const deadInvite = !isPublic && !inviteToken && inviteState && inviteState !== "valid" ? inviteState : null;
  const meta = communityTypeMeta(group.communityType);

  // While a request waits, coming back to the tab re-asks the server: an approval lands as the community itself.
  useEffect(() => {
    if (requestState !== "pending") return;
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestState, router]);

  /** A failure that means the page itself is out of date (the invitation died, the community changed) re-renders it. */
  function fail(body: { error?: string; code?: string } | null, fallback: string) {
    setError(body?.error ?? fallback);
    setStatus("error");
    if (body?.code?.startsWith("invite_") || body?.code === "banned") router.refresh();
  }

  async function join() {
    setStatus("working");
    setError("");
    const res = await fetch(`/api/groups/${group.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invited ? { inviteToken } : {}),
    }).catch(() => null);
    if (!res?.ok) return fail((await res?.json().catch(() => null)) as { error?: string; code?: string } | null, "Couldn't join this community. Check your connection and try again.");
    // The invitation is in the URL; drop it so a refresh doesn't replay a spent token.
    if (invited) router.replace(groupHref(group.id));
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
    const body = (await res?.json().catch(() => null)) as { status?: JoinRequestStatus; error?: string; code?: string } | null;
    if (!res?.ok) {
      fail(body, "Couldn't send your request. Check your connection and try again.");
      // 400: it went public, 403: it went invite-only - either way the page is stale.
      if (res?.status === 400 || res?.status === 403) router.refresh();
      return;
    }
    setRequestState("pending");
    setStatus("idle");
  }

  async function withdraw() {
    setStatus("working");
    const res = await fetch(`/api/groups/${group.id}/join-requests`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return fail(null, "Couldn't withdraw your request. Try again.");
    setRequestState(null);
    setShowMessage(false);
    setMessage("");
    setStatus("idle");
    // An approval that landed in the meantime: the refresh shows the community instead.
    router.refresh();
  }

  const canRequest = !isPublic && !inviteOnly && !invited && !banned;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-1">
      <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} />

      <div className="px-6 pb-7 text-center">
        <div className="-mt-8 flex justify-center">
          <span className="rounded-full ring-4 ring-surface-1">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={64} />
          </span>
        </div>

        <h1 className="mt-3 text-title-lg font-semibold text-primary">{group.name}</h1>
        <p className="mt-1 text-caption text-tertiary">
          {meta.label} · {visibilityLabel(group.visibility)}
          {group.topic ? ` · ${group.topic}` : ""} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
        </p>
        {/* A private or hidden community's description is for its members (as on its share card). */}
        {isPublic && group.description && <p className="mx-auto mt-3 max-w-md text-body-sm leading-relaxed text-secondary">{group.description}</p>}

        <div className="mt-6">
          {deadInvite && !banned && (
            <p role="status" className="mx-auto mb-4 max-w-sm rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-caption leading-relaxed text-secondary">
              {deadInvite === "expired"
                ? "This invitation has expired."
                : deadInvite === "revoked"
                  ? "This invitation was cancelled."
                  : deadInvite === "exhausted"
                    ? "This invitation has already been used."
                    : "This invitation link isn't valid."}{" "}
              {inviteOnly ? "Ask whoever sent it for a new one." : requestState === "pending" ? "Your request to join is still waiting." : "You can still ask to join below."}
            </p>
          )}
          {banned ? (
            <p className="text-body-sm text-secondary">You can&apos;t join this community.</p>
          ) : isPublic || invited ? (
            <Button variant="primary" size="md" loading={status === "working"} onClick={() => void join()}>
              {invited ? "Accept invitation" : "Join community"}
            </Button>
          ) : inviteOnly ? (
            !deadInvite && <p className="mx-auto max-w-sm text-body-sm text-secondary">This community is invite-only. Ask a member to send you an invitation link.</p>
          ) : requestState === "pending" ? (
            <div>
              <p className="text-body-sm font-medium text-primary">Request sent</p>
              <p className="mt-1 text-caption text-tertiary">An admin or moderator will review it. You&apos;ll get in as soon as they approve.</p>
              <Button variant="ghost" size="sm" className="mt-3" loading={status === "working"} onClick={() => void withdraw()}>
                Withdraw request
              </Button>
            </div>
          ) : (
            canRequest && (
              <div className="mx-auto max-w-sm">
                {/* Said plainly, then the same form again: a second ask can carry a note too. */}
                {requestState === "rejected" && <p className="mb-3 text-body-sm text-secondary">Your last request wasn&apos;t approved. You can ask again.</p>}
                {showMessage && (
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={500}
                    rows={3}
                    autoFocus
                    placeholder="Tell them why you'd like to join (optional)"
                    aria-label="Message to the admins"
                    className="mb-3 w-full resize-none rounded-control border border-white/10 bg-black/30 px-3 py-2 text-left text-body-sm text-primary placeholder:text-tertiary focus:border-white/30 focus:outline-none"
                  />
                )}
                <Button variant={requestState === "rejected" ? "secondary" : "primary"} size="md" loading={status === "working"} onClick={() => void request()}>
                  {requestState === "rejected" ? "Ask again" : "Request to join"}
                </Button>
                {!showMessage && (
                  <button type="button" onClick={() => setShowMessage(true)} className="mt-2 block w-full text-caption text-tertiary transition hover:text-secondary">
                    Add a message
                  </button>
                )}
              </div>
            )
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-caption text-brand-text">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
