"use client";

import { useState } from "react";

/** The invite "code" is just the group's own uuid, already unguessable and already the page's own
 * URL — no separate invite-token table needed (see getGroupPreview's docstring). Shows the path,
 * not the full origin (window.location isn't available during server render anyway) — the copy
 * button reads window.location.origin itself, inside the click handler, where it's always safe. */
export function InviteLink({ groupId }: { groupId: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/groups/${groupId}`;

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--f1-line)] bg-black/20 px-3 py-2">
      <p className="flex-1 truncate text-xs text-neutral-400">{path}</p>
      <button
        onClick={() => void copy()}
        className="shrink-0 rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-200 transition hover:border-white/30"
      >
        {copied ? "Copied" : "Copy invite link"}
      </button>
    </div>
  );
}
