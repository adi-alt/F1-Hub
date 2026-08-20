"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { GroupPreview } from "@/lib/supabase/groups";

/** Shown when a signed-in visitor opens an invite link for a group they're not in yet — just
 * enough preview (name, member count, avatar) to decide whether to join, per getGroupPreview's
 * own reasoning (src/lib/supabase/groups.ts). */
export function JoinPrompt({ group }: { group: GroupPreview }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");
  const [error, setError] = useState("");

  async function join() {
    setStatus("joining");
    const res = await fetch(`/api/groups/${group.id}/join`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not join group.");
      setStatus("error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-8 text-center">
      <div className="flex justify-center">
        <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={64} />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-white">{group.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
      </p>
      <button
        onClick={() => void join()}
        disabled={status === "joining"}
        className="mt-6 rounded-full bg-[var(--f1-red)] px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "joining" ? "Joining…" : "Join group"}
      </button>
      {status === "error" && <p className="mt-3 text-xs text-[var(--f1-red)]">{error}</p>}
    </div>
  );
}
