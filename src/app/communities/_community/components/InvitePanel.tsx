"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { fieldControlClass } from "@/components/ui/Field";
import { Picker } from "@/components/ui/Picker";
import { EYEBROW } from "@/components/ui/panel";
import type { GroupDetail, GroupInvite } from "@/lib/supabase/groups";
import { groupHref } from "@/lib/routes";

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
      {/* The invitation people actually receive comes first: an email to them (and a notice, if they're on the site). */}
      <EmailInvites group={group} />

      <section className="border-t border-white/[0.06] pt-6">
        <h3 className={EYEBROW}>{isPublic ? "Or share the link" : "Or share a link"}</h3>
        <p className="mt-1 text-caption text-tertiary">
          {isPublic
            ? "Anyone can join this community, so its link is all people need."
            : "For a group chat: anyone with the link can join straight away, until it expires or runs out of uses. Cancel one and it stops working at once."}
        </p>

        {isPublic ? (
          <Button variant="secondary" size="md" className="mt-4" iconStart={Copy} onClick={() => void copy(pageLink(), "page")}>
            {copied === "page" ? "Link copied" : "Copy link"}
          </Button>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="text-caption text-secondary">
                Expires after
                <Picker
                  options={[1, 7, 30].map((n) => ({ value: String(n), label: n === 1 ? "1 day" : `${n} days` }))}
                  value={String(days)}
                  onChange={(v) => setDays(Number(v))}
                  ariaLabel="Expires after"
                  className="mt-1 w-32"
                />
              </div>
              <div className="text-caption text-secondary">
                Can be used
                <Picker
                  options={[1, 5, 10, 25, 100].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "time" : "times"}` }))}
                  value={String(maxUses)}
                  onChange={(v) => setMaxUses(Number(v))}
                  ariaLabel="Can be used"
                  className="mt-1 w-32"
                />
              </div>
              <Button variant="secondary" size="md" iconStart={Link2} loading={busy === "create"} onClick={() => void create()}>
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
    </div>
  );
}

/** Invitations by email: a public community's link, or for a private or hidden one a single-use 7-day link per person,
 * so a forwarded email can't let a second person in. */
function EmailInvites({ group }: { group: GroupDetail }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" } | { kind: "sent"; count: number; members: number } | { kind: "error"; message: string }>({ kind: "idle" });
  const emails = text.split(/[\s,;]+/).filter(Boolean);

  async function send() {
    setState({ kind: "sending" });
    const res = await fetch(`/api/groups/${group.id}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { sent?: number; alreadyMembers?: number; error?: string } | null;
    if (!res?.ok) return setState({ kind: "error", message: body?.error ?? "Couldn't send the invitations. Check your connection and try again." });
    setText("");
    setState({ kind: "sent", count: body?.sent ?? emails.length, members: body?.alreadyMembers ?? 0 });
  }

  return (
    <section>
      <h3 className={EYEBROW}>Invite by email</h3>
      <p className="mt-1 text-caption text-tertiary">
        Each person gets an email with {group.visibility === "public" ? "a link to join" : "their own link, good for 7 days"}, and a notice on the site if they already have an account. Up to 10 addresses at a time.
      </p>
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
          className={`min-w-0 flex-1 basis-64 ${fieldControlClass(false)}`}
        />
        <Button variant="primary" size="md" iconStart={Mail} disabled={emails.length === 0} loading={state.kind === "sending"} onClick={() => void send()}>
          Send invitations
        </Button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-4 text-caption">
        {state.kind === "sent" && (
          <span className="text-success">
            {state.count > 0 ? `Invitation sent to ${state.count} ${state.count === 1 ? "person" : "people"}.` : "No one to invite."}
            {state.members > 0 && ` ${state.members} ${state.members === 1 ? "is" : "are"} already in.`}
          </span>
        )}
        {state.kind === "error" && <span className="text-brand-text">{state.message}</span>}
      </p>
    </section>
  );
}
