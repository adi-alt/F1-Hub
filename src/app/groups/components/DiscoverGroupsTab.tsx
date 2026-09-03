"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { JoinGroupForm } from "./JoinGroupForm";

function PublicGroupCard({ group, index, onJoined }: { group: PublicGroupSummary; index: number; onJoined: (id: string) => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");

  async function join() {
    setStatus("joining");
    const res = await fetch(`/api/groups/${group.id}/join`, { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    onJoined(group.id);
    router.push(`/groups/${group.id}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={40} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{group.name}</p>
            {group.description && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{group.description}</p>}
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Public</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span>
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-neutral-600">{group.id.slice(0, 8)}</span>
        </div>
        <button
          onClick={() => void join()}
          disabled={status === "joining"}
          className="shrink-0 rounded-full border border-[var(--f1-line)] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 disabled:opacity-60"
        >
          {status === "joining" ? "Joining…" : "Join Group"}
        </button>
      </div>
      {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">Could not join - try again.</p>}
    </motion.div>
  );
}

/** Public groups only - listPublicGroups' own doc comment explains why (opt-in visibility, the one
 * deliberate relaxation of "nothing discoverable without an invite" this redesign added). No
 * category filter chips (Competitive/Discussion/Predictions from the original request) - there's
 * no real field on `groups` to categorize by, and a filter that doesn't actually filter anything
 * real would be exactly the "fake interaction" this app's own established pattern (PracticeSummary,
 * a few rounds back) avoids; search is real and stays. */
export function DiscoverGroupsTab() {
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<PublicGroupSummary[] | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/groups?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((body: { groups: PublicGroupSummary[] }) => setGroups(body.groups))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Discover Groups</p>
      <p className="mt-1 text-sm text-neutral-500">Find public F1 communities and prediction leagues.</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search groups by name or ID"
        className="mt-4 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
      />

      <div className="mt-4">
        {groups === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-[var(--f1-line)] bg-white/[0.03]" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">
            No public groups match yet - be the first to create one and make it public.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups
              .filter((g) => !joinedIds.has(g.id))
              .map((g, i) => (
                <PublicGroupCard key={g.id} group={g} index={i} onJoined={(id) => setJoinedIds((prev) => new Set(prev).add(id))} />
              ))}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-[var(--f1-line)] pt-5">
        <p className="mb-2 text-xs text-neutral-500">Have an invite link to a private group?</p>
        <JoinGroupForm compact />
      </div>
    </div>
  );
}
