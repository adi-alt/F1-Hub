"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Invite links are just a group's own uuid in the URL (/groups/<id>) — accept either the whole
// pasted link or a bare id by pulling the uuid pattern out rather than parsing a URL.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function JoinGroupForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const groupId = value.trim().match(UUID_RE)?.[0];
    if (!groupId) {
      setError("Paste the invite link or group code.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    const res = await fetch(`/api/groups/${groupId}/join`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not join group.");
      setStatus("error");
      return;
    }
    router.push(`/groups/${groupId}`);
  }

  if (compact) {
    return (
      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste invite link or code"
          className="flex-1 rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-white/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="shrink-0 rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-white/30 disabled:opacity-60"
        >
          {status === "saving" ? "Joining…" : "Join"}
        </button>
        {status === "error" && <p className="mt-2 basis-full text-xs text-[var(--f1-red)]">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-5">
      <p className="text-sm font-semibold text-white">Join a group</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste invite link or code"
        className="mt-3 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="mt-3 rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-white/30 disabled:opacity-60"
      >
        {status === "saving" ? "Joining…" : "Join"}
      </button>
      {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">{error}</p>}
    </form>
  );
}
