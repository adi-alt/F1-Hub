"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export function AvatarUpload({ groupId }: { groupId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the same file again re-trigger onChange next time
    if (!file) return;
    setStatus("uploading");
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch(`/api/groups/${groupId}/avatar`, { method: "POST", body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Upload failed.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-200 transition hover:border-white/30 disabled:opacity-60"
      >
        {status === "uploading" ? "Uploading…" : "Change group avatar"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void onChange(e)}
      />
      {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">{error}</p>}
    </div>
  );
}
