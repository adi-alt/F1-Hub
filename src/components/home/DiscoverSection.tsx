"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { groupHref } from "@/lib/routes";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";

function DiscoverCard({ group, requireAuthToJoin }: { group: PublicGroupSummary; requireAuthToJoin: boolean }) {
  const router = useRouter();
  const openAuthDialog = useAuthDialogStore((s) => s.open);
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");

  async function join() {
    if (requireAuthToJoin) {
      openAuthDialog();
      return;
    }
    setStatus("joining");
    const res = await fetch(`/api/groups/${group.id}/join`, { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    router.push(groupHref(group.id));
  }

  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2 }}
      className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4"
    >
      <div className="flex items-center gap-3">
        <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={40} />
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{group.name}</p>
          <p className="text-xs text-neutral-500">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {group.description && <p className="mt-3 line-clamp-2 text-sm text-neutral-400">{group.description}</p>}
      <button
        type="button"
        onClick={() => void join()}
        disabled={status === "joining"}
        className="mt-3 w-full rounded-full border border-[var(--f1-line)] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 disabled:opacity-60"
      >
        {status === "joining" ? "Joining…" : "Join"}
      </button>
      {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">Could not join - try again.</p>}
    </motion.div>
  );
}

/** Discovery for anyone without groups yet — logged-out visitors browsing (join prompts sign-in
 * first) and signed-in users with zero memberships (join actually joins). Same `listPublicGroups`
 * data/join endpoint DiscoverGroupsTab already uses on /groups — this just renders a homepage-
 * sized teaser of it, not a second discovery implementation. */
export function DiscoverSection({ groups, requireAuthToJoin }: { groups: PublicGroupSummary[]; requireAuthToJoin: boolean }) {
  if (groups.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Discover your community</h2>
        <Link href="/groups" className="text-sm text-neutral-400 transition hover:text-white">
          View all →
        </Link>
      </div>
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerContainer} className="mt-4 grid gap-3 sm:grid-cols-3">
        {groups.map((g) => (
          <DiscoverCard key={g.id} group={g} requireAuthToJoin={requireAuthToJoin} />
        ))}
      </motion.div>
    </section>
  );
}

export function DiscoverSectionSkeleton() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="skeleton-shimmer h-32 rounded-xl" />
      ))}
    </div>
  );
}
