"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Picker } from "@/components/ui/Picker";
import {
  COMMUNITY_TOPICS,
  COMMUNITY_TYPES,
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_LEVELS,
  VISIBILITY_OPTIONS,
  permissionLevel,
  resolveModules,
  toggleableModules,
  type CommunityPermissions,
  type CommunityType,
  type CommunityVisibility,
  type PermissionLevel,
} from "@/lib/communities";
import type { GroupDetail, JoinRequest } from "@/lib/supabase/groups";
import { AvatarUpload } from "../../../components/AvatarUpload";
import { BannerUpload } from "../../../components/BannerUpload";
import { GroupBanner } from "../../../components/GroupBanner";

type Section = "general" | "appearance" | "requests" | "features" | "permissions" | "moderation" | "danger";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "general", label: "General" },
  { value: "appearance", label: "Appearance" },
  { value: "requests", label: "Join requests" },
  { value: "features", label: "Features" },
  { value: "permissions", label: "Permissions" },
  { value: "moderation", label: "Moderation" },
  { value: "danger", label: "Danger zone" },
];

/**
 * Community management, behind its own tab so an ordinary member never sees any of it.
 *
 * Every control here changes something real. In particular there is NO "blocked words" or "report
 * queue" in Moderation: neither has a backing table, and a settings screen full of switches that
 * quietly do nothing is worse than a short one that works. What Moderation does have - the post
 * approval toggle and the live pending queue - is genuinely enforced in createPost.
 */
export function ManageTab({ group }: { group: GroupDetail }) {
  const [section, setSection] = useState<Section>("general");

  return (
    <div className="gap-6 lg:grid lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Management sections" className="-mx-1 mb-4 overflow-x-auto px-1 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0">
        <div className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
          {SECTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSection(s.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition ${
                section === s.value
                  ? s.value === "danger"
                    ? "bg-[var(--f1-red)]/10 text-[var(--f1-red)]"
                    : "bg-white/[0.06] text-white"
                  : "text-neutral-500 hover:bg-white/[0.03] hover:text-neutral-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="min-w-0">
        {section === "general" && <GeneralSection group={group} />}
        {section === "appearance" && <AppearanceSection group={group} />}
        {section === "requests" && <JoinRequestsSection group={group} />}
        {section === "features" && <FeaturesSection group={group} />}
        {section === "permissions" && <PermissionsSection group={group} />}
        {section === "moderation" && <ModerationSection group={group} />}
        {section === "danger" && <DangerSection group={group} />}
      </div>
    </div>
  );
}

/** Shared save plumbing - every section PATCHes the same endpoint with its own slice of fields. */
function useSave(groupId: string) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save(patch: Record<string, unknown>) {
    setStatus("saving");
    setError("");
    const res = await fetch(`/api/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't save your changes.");
      setStatus("error");
      return false;
    }
    setStatus("saved");
    router.refresh();
    return true;
  }

  return { save, status, error };
}

function SaveRow({ status, error, onSave, disabled }: { status: string; error: string; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={status === "saving" || disabled}
        className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {status === "saving" ? "Saving…" : "Save changes"}
      </button>
      {status === "saved" && <span className="text-xs text-emerald-400">Saved</span>}
      {error && (
        <span role="alert" className="text-xs text-[var(--f1-red)]">
          {error}{" "}
          <button type="button" onClick={onSave} className="underline underline-offset-2">
            Retry
          </button>
        </span>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {description && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function GeneralSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [topic, setTopic] = useState(group.topic ?? "");
  const [communityType, setCommunityType] = useState<CommunityType>(group.communityType);
  const [visibility, setVisibility] = useState<CommunityVisibility>(group.visibility);

  return (
    <Section title="General" description="Name, description and how this community is found.">
      <div className="space-y-4">
        <label className="block text-xs text-neutral-400">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="mt-1 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        </label>

        <label className="block text-xs text-neutral-400">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        </label>

        <div className="text-xs text-neutral-400">
          Topic
          <Picker
            options={COMMUNITY_TOPICS.map((t) => ({ value: t, label: t }))}
            value={topic}
            onChange={setTopic}
            placeholder="Choose or type a topic"
            allowCustomValue
            clearable
            ariaLabel="Community topic"
            className="mt-1"
          />
        </div>

        <div className="text-xs text-neutral-400">
          Community type
          <Picker
            options={COMMUNITY_TYPES.map((t) => ({ value: t.value, label: t.label, description: t.tagline }))}
            value={communityType}
            onChange={(next) => setCommunityType(next as CommunityType)}
            ariaLabel="Community type"
            className="mt-1"
          />
          {/* Changing the type changes which modules are available at all, so it's worth saying so
              before they save rather than after tabs appear or vanish. */}
          {communityType !== group.communityType && (
            <p className="mt-1.5 text-[11px] text-amber-400/80">Changing the type changes which features this community can use. Nothing is deleted.</p>
          )}
        </div>

        <div className="text-xs text-neutral-400">
          Visibility
          <Picker
            options={VISIBILITY_OPTIONS.map((v) => ({ value: v.value, label: v.label, description: v.description }))}
            value={visibility}
            onChange={(next) => setVisibility(next as CommunityVisibility)}
            ariaLabel="Visibility"
            className="mt-1"
          />
        </div>
      </div>

      <SaveRow
        status={status}
        error={error}
        disabled={name.trim().length < 3}
        onSave={() => void save({ name, description: description || null, topic: topic || null, communityType, visibility })}
      />
    </Section>
  );
}

function AppearanceSection({ group }: { group: GroupDetail }) {
  return (
    <Section title="Appearance" description="Banner and avatar. Both are optional - a generated look is used when they're unset.">
      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} />
      </div>
      <div className="mt-3 space-y-4">
        <BannerUpload groupId={group.id} hasBanner={!!group.bannerUrl} />
        <AvatarUpload groupId={group.id} />
      </div>
    </Section>
  );
}

function FeaturesSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [features, setFeatures] = useState(group.features);
  const enabled = resolveModules(group.communityType, features);
  const toggles = toggleableModules(group.communityType);

  return (
    <Section title="Features" description="Which sections this community shows. Turning one off hides the tab - nothing is deleted.">
      <div className="space-y-2">
        {enabled
          .filter((m) => !toggles.includes(m))
          .map((m) => (
            <div key={m} className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-3.5 py-2.5">
              <span>
                <span className="block text-sm text-neutral-300">{MODULE_LABELS[m]}</span>
                <span className="block text-[11px] text-neutral-600">{MODULE_DESCRIPTIONS[m]}</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Always on</span>
            </div>
          ))}

        {toggles.map((m) => {
          const on = enabled.includes(m);
          return (
            <button
              key={m}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => setFeatures((prev) => ({ ...prev, [m]: !on }))}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition ${
                on ? "border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.05]" : "border-[var(--f1-line)] hover:border-white/20"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{MODULE_LABELS[m]}</span>
                <span className="block text-[11px] text-neutral-500">{MODULE_DESCRIPTIONS[m]}</span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[var(--f1-red)]" : "bg-white/10"}`} aria-hidden>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </button>
          );
        })}

        {toggles.length === 0 && <p className="text-xs text-neutral-500">This community type has no optional features.</p>}
      </div>

      <SaveRow status={status} error={error} onSave={() => void save({ features })} />
    </Section>
  );
}

function PermissionsSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [permissions, setPermissions] = useState<CommunityPermissions>(group.permissions ?? {});

  return (
    <Section title="Permissions" description="Who can do what. Every one of these is enforced on the server, not just hidden in the UI.">
      <div className="space-y-3">
        {PERMISSION_ACTIONS.map((action) => (
          <div key={action.value} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--f1-line)] bg-black/20 px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-sm text-neutral-200">{action.label}</span>
              <span className="block text-[11px] text-neutral-600">{action.description}</span>
            </span>
            <Picker
              options={PERMISSION_LEVELS}
              value={permissionLevel(permissions, action.value)}
              onChange={(level) => setPermissions((prev) => ({ ...prev, [action.value]: level as PermissionLevel }))}
              ariaLabel={`Who can ${action.label.toLowerCase()}`}
              className="w-52 shrink-0"
              align="end"
            />
          </div>
        ))}
      </div>

      <SaveRow status={status} error={error} onSave={() => void save({ permissions })} />
    </Section>
  );
}

function ModerationSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [moderationEnabled, setModerationEnabled] = useState(group.moderationEnabled);

  return (
    <Section title="Moderation" description="Review posts before they appear in the feed.">
      <button
        type="button"
        role="switch"
        aria-checked={moderationEnabled}
        onClick={() => setModerationEnabled((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition ${
          moderationEnabled ? "border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.05]" : "border-[var(--f1-line)] hover:border-white/20"
        }`}
      >
        <span>
          <span className="block text-sm font-medium text-white">Require post approval</span>
          <span className="block text-[11px] text-neutral-500">
            Member posts wait for an admin or moderator. Admins and moderators bypass their own queue.
          </span>
        </span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${moderationEnabled ? "bg-[var(--f1-red)]" : "bg-white/10"}`} aria-hidden>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${moderationEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
        Pending posts appear inline in the Feed with Approve and Remove, so there&apos;s no separate queue to remember to check. Blocked-word lists and
        a report inbox aren&apos;t built yet and aren&apos;t shown here rather than being shown as switches that do nothing.
      </p>

      <SaveRow status={status} error={error} onSave={() => void save({ moderationEnabled })} />
    </Section>
  );
}

function JoinRequestsSection({ group }: { group: GroupDetail }) {
  const router = useRouter();
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${group.id}/join-requests`)
      .then((res) => (res.ok ? (res.json() as Promise<{ requests: JoinRequest[] }>) : Promise.reject(new Error("failed"))))
      .then((body) => !cancelled && setRequests(body.requests))
      .catch(() => !cancelled && setRequests([]));
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  async function decide(userId: string, decision: "approve" | "reject") {
    setBusy(userId);
    const res = await fetch(`/api/groups/${group.id}/join-requests/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return;
    setRequests((prev) => (prev ?? []).filter((r) => r.userId !== userId));
    router.refresh();
  }

  return (
    <Section title="Join requests" description="People asking to join this community.">
      {requests === null ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-14 rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="rounded-lg border border-[var(--f1-line)] bg-black/20 p-6 text-center text-sm text-neutral-500">
          {group.visibility === "public" ? "This community is public, so people join directly - there's nothing to approve." : "No one is waiting to join."}
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.userId} className="rounded-lg border border-[var(--f1-line)] bg-black/20 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-neutral-200">{request.displayName ?? request.username ?? "Member"}</span>
                  <span className="block text-[11px] text-neutral-600">Asked {new Date(request.createdAt).toLocaleDateString()}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === request.userId}
                    onClick={() => void decide(request.userId, "approve")}
                    className="rounded-full bg-[var(--f1-red)] px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <ConfirmButton onConfirm={() => void decide(request.userId, "reject")} question="Reject?" confirmLabel="Reject" pending={busy === request.userId}>
                    Reject
                  </ConfirmButton>
                </span>
              </div>
              {request.message && <p className="mt-2 border-t border-[var(--f1-line)] pt-2 text-xs leading-relaxed text-neutral-400">{request.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function DangerSection({ group }: { group: GroupDetail }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't delete this community.");
      setDeleting(false);
      return;
    }
    router.push("/groups");
    router.refresh();
  }

  return (
    <Section title="Danger zone" description="These can't be undone.">
      <div className="rounded-lg border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.04] px-4 py-3.5">
        <p className="text-sm font-medium text-neutral-200">Delete this community</p>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
          Every post, comment, prediction and score is permanently removed for all {group.members.length} member
          {group.members.length === 1 ? "" : "s"}. Points already spent on predictions are not refunded.
        </p>
        <div className="mt-3">
          <ConfirmButton
            onConfirm={() => void remove()}
            question={`Permanently delete "${group.name}"?`}
            confirmLabel="Delete forever"
            pending={deleting}
            className="rounded-full border border-[var(--f1-red)]/50 px-3.5 py-1.5 text-xs font-semibold text-[var(--f1-red)] transition hover:bg-[var(--f1-red)]/10 disabled:opacity-40"
          >
            Delete community
          </ConfirmButton>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-[var(--f1-red)]">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}
