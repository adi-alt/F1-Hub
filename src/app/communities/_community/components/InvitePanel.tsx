"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { EYEBROW } from "@/components/ui/panel";
import type { GroupDetail, GroupInvite } from "@/lib/supabase/groups";
import { groupHref } from "@/lib/routes";

const FIELD = "h-8 rounded-control border border-white/10 bg-black/30 px-2.5 text-body-sm text-primary focus:border-white/30 focus:outline-none";

/** "Expires today / tomorrow / in 4 days": how long is left, not a date to work out. */
function expiresIn(iso: string): string {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  return days <= 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}

/** Copies, or when the clipboard is blocked hands the text over to copy by hand: never a "Copied" that didn't happen. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this link:", text);
    return false;
  }
}

/**
 * Inviting people, for everyone this community lets invite (Permissions > Invite people): opened from the head's
 * Invite button. A public community just needs its link; a private or hidden one gets signed links that expire, have a
 * use limit, show who joined through them and can be cancelled. Both can be sent by email. The server decides
 * everything (joinGroup / redeem_group_invite); this only issues, lists and cancels.
 */
export function InvitePanel({ group }: { group: GroupDetail }) {
  const isPublic = group.visibility === "public";
  const [invites, setInvites] = useState<GroupInvite[] | null | "error">(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    fetch(`/api/groups/${group.id}/invites`)
      .then((res) => (res.ok ? (res.json() as Promise<{ invites: GroupInvite[] }>) : Promise.reject(new Error("failed"))))
      .then((body) => !cancelled && setInvites(body.invites))
      .catch(() => !cancelled && setInvites("error"));
    return () => {
      cancelled = true;
    };
  }, [group.id, isPublic, reloadKey]);

  const pageLink = () => `${window.location.origin}${groupHref(group.id)}`;
  const linkFor = (token: string) => `${pageLink()}&invite=${token}`;

  async function copy(text: string, key: string) {
    if (!(await copyText(text))) return;
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  }

  async function create() {
    setBusy("create");
    setError("");
    const res = await fetch(`/api/groups/${group.id}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInDays: days, maxUses }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; token?: string } | null;
    setBusy(null);
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't create the invitation. Check your connection and try again.");
      return;
    }
    setReloadKey((k) => k + 1);
    if (body?.token) void copy(linkFor(body.token), "new");
  }

  async function cancel(id: string) {
    setBusy(id);
    setError("");
    const res = await fetch(`/api/groups/${group.id}/invites/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError("Couldn't cancel that invitation. Try again.");
      return;
    }
    setInvites((prev) => (Array.isArray(prev) ? prev.filter((i) => i.id !== id) : prev));
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className={EYEBROW}>{isPublic ? "Share the link" : "Invitation links"}</h3>
        <p className="mt-1 text-caption text-tertiary">
          {isPublic
            ? "Anyone can join this community, so its link is all people need."
            : "Anyone with a link can join straight away, until it expires or runs out of uses. Cancel one and it stops working at once."}
        </p>

        {isPublic ? (
          <Button variant="primary" size="sm" className="mt-4" iconStart={Copy} onClick={() => void copy(pageLink(), "page")}>
            {copied === "page" ? "Link copied" : "Copy link"}
          </Button>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-caption text-secondary">
                Expires after
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`mt-1 block ${FIELD}`}>
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
              <label className="text-caption text-secondary">
                Can be used
                <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={`mt-1 block ${FIELD}`}>
                  {[1, 5, 10, 25, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "time" : "times"}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="primary" size="sm" iconStart={Link2} loading={busy === "create"} onClick={() => void create()}>
                {copied === "new" ? "Link created and copied" : "Create link"}
              </Button>
            </div>

            <div className="mt-4">
              {invites === null ? (
                <div className="skeleton-shimmer h-14 rounded-control bg-white/[0.04]" />
              ) : invites === "error" ? (
                <p className="text-body-sm text-secondary">
                  Couldn&apos;t load the invitations.{" "}
                  <button type="button" onClick={() => { setInvites(null); setReloadKey((k) => k + 1); }} className="underline underline-offset-2 hover:text-primary">
                    Retry
                  </button>
                </p>
              ) : invites.length === 0 ? (
                <p className="text-body-sm text-tertiary">No open invitation links.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] rounded-control border border-white/10">
                  {invites.map((invite) => (
                    <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                      <span className="min-w-0">
                        <span className="block text-body-sm text-primary">
                          Used {invite.useCount} of {invite.maxUses} · {expiresIn(invite.expiresAt)}
                        </span>
                        <span className="block text-caption text-tertiary">
                          By {invite.creatorName ?? "a member"}
                          {invite.joinedBy.length > 0 && ` · joined: ${invite.joinedBy.join(", ")}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {invite.token && (
                          <Button variant="secondary" size="sm" iconStart={Copy} onClick={() => invite.token && void copy(linkFor(invite.token), invite.id)}>
                            {copied === invite.id ? "Copied" : "Copy"}
                          </Button>
                        )}
                        <ConfirmButton onConfirm={() => void cancel(invite.id)} question="Cancel this link?" confirmLabel="Cancel it" pending={busy === invite.id}>
                          Cancel
                        </ConfirmButton>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 text-caption text-brand-text">
            {error}
          </p>
        )}
      </section>

      <EmailInvites group={group} />
    </div>
  );
}

/** Invitations by email: a public community's link, or for a private or hidden one a single-use 7-day link per person,
 * so a forwarded email can't let a second person in. */
function EmailInvites({ group }: { group: GroupDetail }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" } | { kind: "sent"; count: number } | { kind: "error"; message: string }>({ kind: "idle" });
  const emails = text.split(/[\s,;]+/).filter(Boolean);

  async function send() {
    setState({ kind: "sending" });
    const res = await fetch(`/api/groups/${group.id}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { sent?: number; error?: string } | null;
    if (!res?.ok) return setState({ kind: "error", message: body?.error ?? "Couldn't send the invitations. Check your connection and try again." });
    setText("");
    setState({ kind: "sent", count: body?.sent ?? emails.length });
  }

  return (
    <section>
      <h3 className={EYEBROW}>Invite by email</h3>
      <p className="mt-1 text-caption text-tertiary">Up to 10 addresses at a time, separated by commas or spaces.</p>
      <div className="mt-4 flex flex-wrap items-start gap-2">
        <input
          type="text"
          inputMode="email"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (state.kind !== "sending") setState({ kind: "idle" });
          }}
          onKeyDown={(e) => e.key === "Enter" && emails.length > 0 && void send()}
          placeholder="friend@example.com, another@example.com"
          aria-label="Email addresses to invite"
          className={`min-w-0 flex-1 basis-64 ${FIELD}`}
        />
        <Button variant="secondary" size="sm" iconStart={Mail} disabled={emails.length === 0} loading={state.kind === "sending"} onClick={() => void send()}>
          Send
        </Button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-4 text-caption">
        {state.kind === "sent" && <span className="text-success">Sent to {state.count} {state.count === 1 ? "person" : "people"}.</span>}
        {state.kind === "error" && <span className="text-brand-text">{state.message}</span>}
      </p>
    </section>
  );
}
