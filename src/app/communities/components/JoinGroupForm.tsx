"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { fieldControlClass } from "@/components/ui/Field";
import { extractInviteToken } from "@/lib/inviteLink";
import { groupHref } from "@/lib/routes";

// A pasted link is /groups/<id> (a public community) or /groups/<id>?invite=<token> (a private one).
// Accept either the whole link or a bare id by pulling the uuid out rather than parsing a URL, and
// carry the invitation token along when there is one. The id alone never admits anyone to a private
// community - the server decides (joinGroup) - so a bare private link falls through to the
// community's own page, where the person can ask to join.
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
      setError("Paste the invite link or community code.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    const inviteToken = extractInviteToken(value);
    const res = await fetch(`/api/groups/${groupId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteToken ? { inviteToken } : {}),
    }).catch(() => null);
    if (!res) {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("error");
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (!res.ok) {
      // A private community without a valid invitation, or one whose invitation has died: its own page says what
      // happened and offers what's left (asking to join), instead of a dead-end error here.
      if (body?.code === "request_required" || body?.code?.startsWith("invite_")) {
        router.push(inviteToken ? `${groupHref(groupId)}&invite=${encodeURIComponent(inviteToken)}` : groupHref(groupId));
        return;
      }
      setError(body?.error ?? "Could not join community.");
      setStatus("error");
      return;
    }
    router.push(groupHref(groupId));
  }

  if (compact) {
    return (
      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste invite link or code"
          aria-label="Invite link or community code"
          className={`flex-1 ${fieldControlClass(status === "error")}`}
        />
        <Button type="submit" variant="secondary" size="md" loading={status === "saving"}>
          Join
        </Button>
        {status === "error" && <p className="mt-2 basis-full text-caption text-brand-text">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-card border border-white/10 bg-surface-1 p-5">
      <p className="text-body-sm font-semibold text-primary">Join a community</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste invite link or code"
        aria-label="Invite link or community code"
        className={`mt-3 ${fieldControlClass(status === "error")}`}
      />
      <Button type="submit" variant="secondary" size="md" className="mt-3" loading={status === "saving"}>
        Join
      </Button>
      {status === "error" && <p className="mt-2 text-caption text-brand-text">{error}</p>}
    </form>
  );
}
