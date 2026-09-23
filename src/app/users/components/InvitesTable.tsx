"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { inviteStatus, type InviteStatus, type UserInvite } from "@/lib/supabase/invites";
import { useResendInvite, useRevokeInvite } from "../_hooks/useInvites";
import { roleLabel } from "./RoleSelect";

const HEADER_CLASS = "text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md border-b border-white/[0.08]";
const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

/** Four states, four treatments. Pending and accepted are the two that matter day to day, so
 * they get the reserved status colours; revoked and expired are both "this one is over" and read
 * as quiet neutrals rather than competing for attention. Each ships with its label, never the
 * colour alone. */
const STATUS_STYLE: Record<InviteStatus, { label: string; className: string; dot: string }> = {
  pending: { label: "Pending", className: "border-amber-500/30 bg-amber-500/10 text-amber-300", dot: "bg-amber-400" },
  accepted: { label: "Accepted", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "bg-emerald-400" },
  revoked: { label: "Revoked", className: "border-[var(--f1-line)] bg-white/[0.03] text-neutral-400", dot: "bg-neutral-500" },
  expired: { label: "Expired", className: "border-[var(--f1-line)] bg-white/[0.03] text-neutral-400", dot: "bg-neutral-500" },
};

function StatusBadge({ status }: { status: InviteStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "in 6 days" / "3 days ago" for the expiry column — an absolute date answers "when", but the
 * only question an admin actually has about a pending invite is how much runway is left on it. */
function relativeDays(value: string, now: number): string {
  const diffMs = new Date(value).getTime() - now;
  if (Number.isNaN(diffMs)) return "—";
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} ${days === 1 ? "day" : "days"}`;
  const ago = Math.abs(days);
  return `${ago} ${ago === 1 ? "day" : "days"} ago`;
}

type StatusFilter = "all" | InviteStatus;

export function InvitesTable({ invites, canManage, now }: { invites: UserInvite[]; canManage: boolean; now: number }) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const scrollRef = useNestedLenisScroll(filter);

  const revokeInvite = useRevokeInvite();
  const resendInvite = useResendInvite();

  // Status is derived from the clock, so it's computed once per render pass and reused for both
  // the filter and the badge — deriving it twice risks the two disagreeing across a midnight
  // boundary mid-render.
  const withStatus = useMemo(() => invites.map((invite) => ({ invite, status: inviteStatus(invite, now) })), [invites, now]);
  const rows = useMemo(() => (filter === "all" ? withStatus : withStatus.filter((r) => r.status === filter)), [withStatus, filter]);

  const counts = useMemo(() => {
    const tally: Record<InviteStatus, number> = { pending: 0, accepted: 0, revoked: 0, expired: 0 };
    for (const { status } of withStatus) tally[status]++;
    return tally;
  }, [withStatus]);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { value: StatusFilter; label: string }[] = [
    { value: "all", label: `All (${withStatus.length})` },
    { value: "pending", label: `Pending (${counts.pending})` },
    { value: "accepted", label: `Accepted (${counts.accepted})` },
  ];

  const error = revokeInvite.error ?? resendInvite.error;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--f1-line)] px-4 py-4">
        <h2 className="text-base font-semibold text-white">Invitations</h2>
        <div className="flex gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              aria-pressed={filter === tab.value}
              className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                filter === tab.value ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="border-b border-[var(--f1-line)] bg-[var(--f1-red)]/[0.08] px-4 py-2 text-sm text-red-300">
          {error instanceof Error ? error.message : "That didn't work. Try again."}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={EmptyIcons.members}
            title={filter === "all" ? "No invitations yet" : `No ${filter} invitations`}
            description={
              filter === "all"
                ? "People can still sign up on their own — invite someone above to reserve their role in advance."
                : "Nothing in this state right now."
            }
          />
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-[420px] overflow-auto scrollbar-hide">
          <table className="w-full min-w-[680px] text-sm">
            <thead className={`sticky top-0 z-10 ${HEADER_CLASS}`} style={HEADER_STYLE}>
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Invited</th>
                <th className="px-4 py-3">Expires</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--f1-line)]">
              <AnimatePresence initial={false}>
                {rows.map(({ invite, status }) => {
                  const busy = busyId === invite.id;
                  return (
                    <motion.tr
                      key={invite.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="transition hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 text-sm text-white">{invite.email}</td>
                      <td className="px-4 py-3 text-sm text-neutral-400">{roleLabel(invite.role)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-neutral-400">{formatDate(invite.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-400">
                        {status === "pending" ? relativeDays(invite.expiresAt, now) : "—"}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {/* Only a pending invite has anything left to act on — an accepted one
                              is history, and a revoked/expired one is re-issued by inviting the
                              address again rather than by reviving the old row. */}
                          {status === "pending" ? (
                            <div className="flex items-center justify-end gap-3">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(invite.id, () => resendInvite.mutateAsync(invite.id))}
                                className="text-xs text-neutral-400 transition hover:text-white disabled:opacity-40"
                              >
                                {busy ? "Working…" : "Resend"}
                              </button>
                              <ConfirmButton
                                onConfirm={() => void run(invite.id, () => revokeInvite.mutateAsync(invite.id))}
                                question="Revoke?"
                                confirmLabel="Revoke"
                                pending={busy}
                                className="text-xs text-neutral-400 transition hover:text-[var(--f1-red)] disabled:opacity-40"
                              >
                                Revoke
                              </ConfirmButton>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-600">—</span>
                          )}
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
