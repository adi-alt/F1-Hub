"use client";

import { Button } from "@/components/ui/Button";
import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

// Mirrors AvatarUpload.tsx - same immediate-upload-then-refresh flow - plus a Remove action
// (removeGroupBanner has no avatar equivalent: a group always needs some icon, but "no banner,
// fall back to the generated gradient" is a real, supported state).
export function BannerUpload({ groupId, hasBanner }: { groupId: string; hasBanner: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "removing" | "error">("idle");
  const [error, setError] = useState("");

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatus("uploading");
    const form = new FormData();
    form.append("banner", file);
    const res = await fetch(`/api/groups/${groupId}/banner`, { method: "POST", body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Upload failed.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  async function remove() {
    setStatus("removing");
    const res = await fetch(`/api/groups/${groupId}/banner`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not remove banner.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={status === "removing"} loading={status === "uploading"}>
          {hasBanner ? "Replace cover" : "Upload cover"}
        </Button>
        {hasBanner && (
          <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={status === "uploading"} loading={status === "removing"}>
            Remove
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onChange(e)} />
      {status === "error" && <p role="alert" className="mt-2 text-caption text-danger">{error}</p>}
    </div>
  );
}
