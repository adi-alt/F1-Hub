"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res.ok || !body?.id) {
      setError(body?.error ?? "Could not create group.");
      setStatus("error");
      return;
    }
    router.push(`/groups/${body.id}`);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-5">
      <p className="text-sm font-semibold text-white">Create a group</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
        maxLength={40}
        className="mt-3 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={status === "saving" || name.trim().length < 3}
        className="mt-3 rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "saving" ? "Creating…" : "Create"}
      </button>
      {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">{error}</p>}
    </form>
  );
}
