"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AvatarUpload } from "../../components/AvatarUpload";
import { BannerUpload } from "../../components/BannerUpload";
import { GroupBanner } from "../../components/GroupBanner";
import type { GroupDetail, GroupVisibility } from "@/lib/supabase/groups";

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-[var(--f1-line)] pb-5 last:border-0">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

export function GroupSettingsTab({ group }: { group: GroupDetail }) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility);
  const [moderationEnabled, setModerationEnabled] = useState(group.moderationEnabled);
  const [inviteEmail, setInviteEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function save() {
    setStatus("saving");
    const res = await fetch(`/api/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, visibility, moderationEnabled }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not save settings.");
      setStatus("error");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    const res = await fetch(`/api/groups/${group.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [inviteEmail.trim()] }),
    });
    if (res.ok) setInviteEmail("");
  }

  async function deleteGroupNow() {
    const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
    if (res.ok) router.push("/groups");
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="General">
        <div className="overflow-hidden rounded-lg">
          <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} />
        </div>
        <div className="mt-2">
          <BannerUpload groupId={group.id} hasBanner={!!group.bannerUrl} />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <AvatarUpload groupId={group.id} />
        </div>
        <label className="mt-4 block text-sm text-neutral-400">
          Group name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none" />
        </label>
        <label className="mt-3 block text-sm text-neutral-400">
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={2} className="mt-1 w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none" />
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "private" as const, title: "Private", desc: "Members can only join through an invite." },
              { value: "public" as const, title: "Public", desc: "Anyone can discover and join this group." },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVisibility(opt.value)}
              className={`rounded-lg border px-3 py-2.5 text-left text-xs transition ${visibility === opt.value ? "border-[var(--f1-red)] bg-[var(--f1-red)]/10" : "border-[var(--f1-line)] hover:border-white/20"}`}
            >
              <p className="font-semibold text-white">{opt.title}</p>
              <p className="mt-0.5 text-neutral-500">{opt.desc}</p>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Members">
        <p className="mb-2 text-xs text-neutral-500">Invite by email</p>
        <div className="flex gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="person@email.com"
            type="email"
            className="flex-1 rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
          />
          <button onClick={() => void sendInvite()} className="shrink-0 rounded-lg border border-[var(--f1-line)] px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-white/30">
            + Add
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Promote, demote, or remove members from the Members tab.</p>
      </SettingsSection>

      <SettingsSection title="Moderation">
        <label className="flex items-center justify-between text-sm text-neutral-300">
          Require approval for member posts
          <button
            type="button"
            onClick={() => setModerationEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${moderationEnabled ? "bg-[var(--f1-red)]" : "bg-white/10"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${moderationEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </label>
      </SettingsSection>

      {error && <p className="text-xs text-[var(--f1-red)]">{error}</p>}
      <button onClick={() => void save()} disabled={status === "saving"} className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save settings"}
      </button>

      <SettingsSection title="Danger Zone">
        {deleteConfirm ? (
          <div className="rounded-lg border border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.06] p-3">
            <p className="text-sm text-neutral-200">Delete this group permanently? All posts, predictions, and scores are lost.</p>
            <div className="mt-2 flex gap-3">
              <button onClick={() => void deleteGroupNow()} className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110">
                Delete group
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="text-xs text-neutral-400 hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setDeleteConfirm(true)} className="text-sm text-[var(--f1-red)] hover:brightness-125">
            Delete group
          </button>
        )}
      </SettingsSection>
    </div>
  );
}
