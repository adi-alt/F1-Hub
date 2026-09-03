"use client";

import { useState } from "react";
import type { GroupSummary } from "@/lib/supabase/groups";

/** "Post to: [group]" at the top of the home feed - posting from the global feed still needs a
 * real target group (posts belong to exactly one group, same as the in-group composer), just
 * picked here instead of implied by which group's page you're on. Reuses the existing
 * POST /api/groups/[id]/posts route unchanged. */
export function PostComposer({ groups, onPosted }: { groups: GroupSummary[]; onPosted: () => void }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState("");

  if (groups.length === 0) return null;
  const group = groups.find((g) => g.id === groupId);

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || !groupId) return;
    setPosting(true);
    setNotice("");
    const res = await fetch(`/api/groups/${groupId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });
    const body = (await res.json().catch(() => null)) as { status?: "published" | "pending" } | null;
    if (res.ok) {
      setContent("");
      setNotice(body?.status === "pending" ? "Sent for moderator approval." : "Posted.");
      onPosted();
    } else {
      setNotice("Could not post - try again.");
    }
    setPosting(false);
  }

  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's happening in F1?"
        rows={2}
        maxLength={2000}
        className="w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Post to
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-md border border-[var(--f1-line)] bg-black/30 px-2 py-1 text-xs text-neutral-200 focus:border-white/30 focus:outline-none"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id} className="bg-[var(--f1-carbon)]">
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          {notice && <span className="text-xs text-neutral-500">{notice}</span>}
          <button
            onClick={() => void submit()}
            disabled={posting || !content.trim() || !group}
            className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
