"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Result = { sent: string[]; alreadyMembers: string[] };

/** The trigger, styled as this page's one primary action - the same red fill every other primary
 * button in the app uses, not another neutral outline control lost among the filters. */
export function InviteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--f1-red)] px-3 text-sm font-medium text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
        <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 16c0-2.7 2.4-4.5 5.5-4.5s5.5 1.8 5.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M16 6.5v5M13.5 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Invite
    </button>
  );
}

/**
 * An inline panel that opens under the table header, not a modal - the same treatment Nexus's own
 * Users page uses for this, and it keeps the roster visible behind it so an admin can see who's
 * already here while typing an address.
 *
 * What it does NOT do, deliberately: pre-assign a role, or add a "pending" row to the table. F1
 * Hub has open signup and no allowlist, so there is no account to attach a role to until the
 * person actually signs up - inventing a placeholder row would be showing a user who doesn't
 * exist. The invite is a real email; the role control in each row handles the rest once they join.
 */
export function InvitePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // One field, split on commas/spaces/newlines - pasting a list out of a spreadsheet or an email
  // client works without asking anyone to reformat it first.
  const emails = value
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  async function send() {
    if (emails.length === 0 || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const body = (await res.json().catch(() => null)) as (Result & { error?: string }) | null;
      if (!res.ok) {
        setError(body?.error ?? "Couldn't send that invite.");
        return;
      }
      setResult({ sent: body?.sent ?? [], alreadyMembers: body?.alreadyMembers ?? [] });
      setValue("");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  function close() {
    onClose();
    setError(null);
    setResult(null);
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden border-b border-[var(--f1-line)]"
        >
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Invite people to F1 Hub</p>
              <button type="button" onClick={close} aria-label="Close invite panel" className="rounded p-1 text-neutral-500 transition hover:text-white">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-3.5 w-3.5">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
                placeholder="name@example.com, another@example.com"
                aria-label="Email addresses to invite"
                className="h-9 flex-1 rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 text-sm text-white placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={emails.length === 0 || sending}
                className="flex h-9 shrink-0 items-center justify-center rounded-lg bg-[var(--f1-red)] px-4 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {sending ? "Sending…" : emails.length > 1 ? `Send ${emails.length} invites` : "Send invite"}
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              Separate addresses with commas. They&apos;ll get a link to sign up - you can set their role here once they do.
            </p>

            {error && <p className="mt-2 text-xs text-[var(--f1-red)]">{error}</p>}

            {result && (
              <div className="mt-2 space-y-1 text-xs">
                {result.sent.length > 0 && (
                  <p className="text-emerald-400">
                    Invite sent to {result.sent.length === 1 ? result.sent[0] : `${result.sent.length} people`}.
                  </p>
                )}
                {result.alreadyMembers.length > 0 && (
                  <p className="text-neutral-500">
                    {result.alreadyMembers.length === 1 ? `${result.alreadyMembers[0]} already has` : `${result.alreadyMembers.length} of those already have`} an
                    account - not emailed again.
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
