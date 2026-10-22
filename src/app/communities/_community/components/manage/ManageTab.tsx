"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { fieldControlClass } from "@/components/ui/Field";
import { EYEBROW } from "@/components/ui/panel";
import { Picker } from "@/components/ui/Picker";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { TabList, Tabs, type TabItem } from "@/components/ui/Tabs";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import {
  COMMUNITY_TOPICS,
  COMMUNITY_TYPES,
  MAX_TAGLINE_CHARS,
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

type Section = "general" | "appearance" | "requests" | "features" | "permissions" | "delete";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "general", label: "General" },
  { value: "appearance", label: "Appearance" },
  { value: "requests", label: "Join requests" },
  { value: "features", label: "Features" },
  { value: "permissions", label: "Permissions" },
  { value: "delete", label: "Delete" },
];

/**
 * Running a community, in the site's settings language (Account › Notifications, Profile): underline tabs across the
 * top, eyebrow-labelled fields, and settings as divided rows with the control on the right. No boxes inside the window.
 *
 * Every control here changes something real. There is no "blocked words" or "report queue": neither has a backing
 * table, and switches that quietly do nothing are worse than a short screen that works.
 */
export function ManageTab({ group, pendingRequests = 0 }: { group: GroupDetail; pendingRequests?: number }) {
  // A moderator's part of running a community is the door: join requests. Requests only exist for a private
  // community (a hidden one is invite-only), unless some are still waiting from before a change.
  const showRequests = group.visibility === "private" || pendingRequests > 0;
  const sections = SECTIONS.filter((s) => (s.value === "requests" ? showRequests : group.myRole === "admin"));
  const [section, setSection] = useState<Section>(pendingRequests > 0 && showRequests ? "requests" : (sections[0]?.value ?? "general"));
  // Sections stay mounted once opened, so a half-made edit survives a look at another section.
  const [opened, setOpened] = useState<Set<Section>>(() => new Set([section]));
  const open = (next: Section) => {
    setSection(next);
    setOpened((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };
  const panel = (value: Section, node: React.ReactNode) => opened.has(value) && <div hidden={section !== value}>{node}</div>;
  const items: TabItem<Section>[] = sections.map((s) => ({ ...s, count: s.value === "requests" && pendingRequests > 0 ? pendingRequests : undefined }));

  return (
    <div>
      {items.length > 1 && (
        <Tabs value={section} onValueChange={open} items={items}>
          <TabList aria-label="Management sections" className="border-b border-white/[0.06]" />
        </Tabs>
      )}
      <div className={items.length > 1 ? "pt-5" : ""}>
        {panel("general", <GeneralSection group={group} />)}
        {panel("appearance", <AppearanceSection group={group} />)}
        {panel("requests", <JoinRequestsSection group={group} pendingRequests={pendingRequests} />)}
        {panel("features", <FeaturesSection group={group} />)}
        {panel("permissions", <PermissionsSection group={group} />)}
        {panel("delete", <DeleteSection group={group} />)}
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
      setError(body?.error ?? "Couldn't save your changes. Check your connection and try again.");
      setStatus("error");
      return false;
    }
    setStatus("saved");
    router.refresh();
    return true;
  }

  return { save, status, error };
}

/** Save and Discard, as the Profile form has them. */
function SaveRow({ status, error, onSave, onDiscard, disabled, dirty, hint }: { status: string; error: string; onSave: () => void; onDiscard: () => void; disabled?: boolean; dirty: boolean; hint?: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
      <Button variant="primary" size="sm" onClick={onSave} disabled={disabled || !dirty} loading={status === "saving"}>
        {status === "saved" && !dirty ? "Saved" : "Save changes"}
      </Button>
      {dirty && status !== "saving" && (
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          Discard
        </Button>
      )}
      {hint && dirty && <span className="text-caption text-tertiary">{hint}</span>}
      {error && (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** One line under the tabs saying what the section is for. */
const Intro = ({ children }: { children: React.ReactNode }) => <p className="mb-5 max-w-prose text-body-sm text-secondary">{children}</p>;

/** A field with its eyebrow label, as the Profile form lays them out. */
function Labeled({ label, children, note, className = "" }: { label: string; children: React.ReactNode; note?: React.ReactNode; className?: string }) {
  return (
    <div className={`block min-w-0 ${className}`}>
      <span className={EYEBROW}>{label}</span>
      <div className="mt-2">{children}</div>
      {note}
    </div>
  );
}

/** A setting as a row: what it is on the left, its control on the right (Settings › Notifications). */
function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-body-sm font-medium text-primary">{title}</p>
        {description && <p className="mt-0.5 text-caption text-tertiary">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}

/** What changing to each visibility does, said before Save rather than discovered after. */
const VISIBILITY_CHANGE: Record<CommunityVisibility, string> = {
  public: "It will be listed in Discover and anyone can join without asking. Requests still waiting stay in Join requests.",
  private: "It won't be listed. People with the link can ask to join; you or a moderator approve them. Open invitation links keep working.",
  hidden: "It won't be listed, and only people with an invitation link can join: no one can ask. Open invitation links keep working.",
};

function GeneralSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [tagline, setTagline] = useState(group.tagline ?? "");
  const [topic, setTopic] = useState(group.topic ?? "");
  const [communityType, setCommunityType] = useState<CommunityType>(group.communityType);
  const [visibility, setVisibility] = useState<CommunityVisibility>(group.visibility);
  // Compared against the `group` prop, which catches up once router.refresh() lands after a save.
  const isDirty =
    name !== group.name ||
    description !== (group.description ?? "") ||
    tagline !== (group.tagline ?? "") ||
    topic !== (group.topic ?? "") ||
    communityType !== group.communityType ||
    visibility !== group.visibility;
  useUnsavedChangesWarning(isDirty);
  const circlePublic = communityType === "private_circle" && visibility === "public";
  const discard = () => {
    setName(group.name);
    setDescription(group.description ?? "");
    setTagline(group.tagline ?? "");
    setTopic(group.topic ?? "");
    setCommunityType(group.communityType);
    setVisibility(group.visibility);
  };

  return (
    <section aria-label="General">
      <Intro>The name, what it&apos;s about, and who can find and join it.</Intro>
      <div className="grid gap-5 sm:grid-cols-2">
        <Labeled label="Name" note={name.trim().length < 3 && <p className="mt-1.5 text-caption text-danger">At least 3 characters.</p>}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Name" className={fieldControlClass(name.trim().length < 3)} />
        </Labeled>
        <Labeled label="Topic">
          <Picker options={COMMUNITY_TOPICS.map((t) => ({ value: t, label: t }))} value={topic} onChange={setTopic} placeholder="Choose or type a topic" allowCustomValue clearable ariaLabel="Topic" />
        </Labeled>
        <Labeled label="Description" className="sm:col-span-2" note={<p className="mt-1.5 text-caption tabular text-tertiary">{description.length}/280</p>}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} aria-label="Description" className={`resize-none ${fieldControlClass(false)}`} />
        </Labeled>
        <Labeled label="Tagline" className="sm:col-span-2" note={<p className="mt-1.5 text-caption tabular text-tertiary">{tagline.length}/{MAX_TAGLINE_CHARS} · shown over the cover</p>}>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={MAX_TAGLINE_CHARS} placeholder="A short line over the cover image" aria-label="Tagline" className={fieldControlClass(false)} />
        </Labeled>
        <Labeled
          label="Type"
          note={communityType !== group.communityType && <p className="mt-1.5 text-caption text-warning">Changing the type changes which features it can use. Nothing is deleted.</p>}
        >
          <Picker options={COMMUNITY_TYPES.map((t) => ({ value: t.value, label: t.label, description: t.tagline }))} value={communityType} onChange={(next) => setCommunityType(next as CommunityType)} ariaLabel="Type" />
        </Labeled>
        <Labeled
          label="Who can join"
          note={
            circlePublic ? (
              <p className="mt-1.5 text-caption text-danger">A Private Circle can&apos;t be public. Pick another type or visibility.</p>
            ) : (
              visibility !== group.visibility && <p className="mt-1.5 text-caption text-warning">{VISIBILITY_CHANGE[visibility]}</p>
            )
          }
        >
          <Picker
            options={VISIBILITY_OPTIONS.filter((v) => !(communityType === "private_circle" && v.value === "public")).map((v) => ({ value: v.value, label: v.label, description: v.description }))}
            value={visibility}
            onChange={(next) => setVisibility(next as CommunityVisibility)}
            ariaLabel="Who can join"
          />
        </Labeled>
      </div>

      <SaveRow
        status={status}
        error={error}
        dirty={isDirty}
        disabled={name.trim().length < 3 || circlePublic}
        onDiscard={discard}
        onSave={() => void save({ name, description: description || null, tagline: tagline || null, topic: topic || null, communityType, visibility })}
      />
    </section>
  );
}

function AppearanceSection({ group }: { group: GroupDetail }) {
  return (
    <section aria-label="Appearance">
      <Intro>The cover across the top of the page and the icon beside the name. Both are optional: without them the page uses its own generated look.</Intro>
      <div className="overflow-hidden rounded-control">
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} />
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Labeled label="Cover">
          <BannerUpload groupId={group.id} hasBanner={!!group.bannerUrl} />
        </Labeled>
        <Labeled label="Icon">
          <div className="flex items-center gap-3">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} seed={group.id} size={40} />
            <AvatarUpload groupId={group.id} />
          </div>
        </Labeled>
      </div>
    </section>
  );
}

/** Which sections the community shows, and whether posts are reviewed first: one list of switches, one Save. */
function FeaturesSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [features, setFeatures] = useState(group.features);
  const [moderationEnabled, setModerationEnabled] = useState(group.moderationEnabled);
  const dirty = JSON.stringify(features) !== JSON.stringify(group.features) || moderationEnabled !== group.moderationEnabled;
  useUnsavedChangesWarning(dirty);
  const enabled = resolveModules(group.communityType, features);
  const toggles = toggleableModules(group.communityType);

  return (
    <section aria-label="Features">
      <Intro>What this community shows. Turning a section off hides it; nothing is deleted.</Intro>
      <ul className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
        {enabled
          .filter((m) => !toggles.includes(m))
          .map((m) => (
            <SettingRow key={m} title={MODULE_LABELS[m]} description={MODULE_DESCRIPTIONS[m]}>
              <span className="text-caption text-tertiary">Always on</span>
            </SettingRow>
          ))}
        {toggles.map((m) => (
          <SettingRow key={m} title={MODULE_LABELS[m]} description={MODULE_DESCRIPTIONS[m]}>
            <Switch checked={enabled.includes(m)} onChange={(on) => setFeatures((prev) => ({ ...prev, [m]: on }))} label={MODULE_LABELS[m]} />
          </SettingRow>
        ))}
        <SettingRow title="Review posts first" description="Members' posts wait for an admin or moderator, who approve them in the feed. Admins' and moderators' own posts go straight up.">
          <Switch checked={moderationEnabled} onChange={setModerationEnabled} label="Review posts first" />
        </SettingRow>
      </ul>

      <SaveRow
        status={status}
        error={error}
        dirty={dirty}
        onDiscard={() => {
          setFeatures(group.features);
          setModerationEnabled(group.moderationEnabled);
        }}
        onSave={() => void save({ features, moderationEnabled })}
      />
    </section>
  );
}

function PermissionsSection({ group }: { group: GroupDetail }) {
  const { save, status, error } = useSave(group.id);
  const [permissions, setPermissions] = useState<CommunityPermissions>(group.permissions ?? {});
  const dirty = JSON.stringify(permissions) !== JSON.stringify(group.permissions ?? {});
  useUnsavedChangesWarning(dirty);

  return (
    <section aria-label="Permissions">
      <Intro>Who can do what. Every one of these is checked on the server, not only hidden on the page.</Intro>
      <ul className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
        {PERMISSION_ACTIONS.map((action) => (
          <SettingRow key={action.value} title={action.label} description={action.description}>
            <Picker
              options={PERMISSION_LEVELS}
              value={permissionLevel(permissions, action.value)}
              onChange={(level) => setPermissions((prev) => ({ ...prev, [action.value]: level as PermissionLevel }))}
              ariaLabel={`Who can ${action.label.toLowerCase()}`}
              className="w-48"
              align="end"
            />
          </SettingRow>
        ))}
      </ul>

      <SaveRow status={status} error={error} dirty={dirty} onDiscard={() => setPermissions(group.permissions ?? {})} onSave={() => void save({ permissions })} />
    </section>
  );
}

function JoinRequestsSection({ group, pendingRequests }: { group: GroupDetail; pendingRequests: number }) {
  const router = useRouter();
  const [requests, setRequests] = useState<JoinRequest[] | null | "error">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Reloads when the page's own count moves (a new request arriving while this is open).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${group.id}/join-requests`)
      .then((res) => (res.ok ? (res.json() as Promise<{ requests: JoinRequest[] }>) : Promise.reject(new Error("failed"))))
      .then((body) => !cancelled && setRequests(body.requests))
      .catch(() => !cancelled && setRequests("error"));
    return () => {
      cancelled = true;
    };
  }, [group.id, pendingRequests, reloadKey]);

  async function decide(userId: string, decision: "approve" | "reject") {
    setBusy(userId);
    setError("");
    const res = await fetch(`/api/groups/${group.id}/join-requests/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't save that decision. Check your connection and try again.");
      // Already decided by someone else, or gone: the list is out of date.
      if (res?.status === 404 || res?.status === 409) setReloadKey((k) => k + 1);
      return;
    }
    setRequests((prev) => (Array.isArray(prev) ? prev.filter((r) => r.userId !== userId) : prev));
    router.refresh();
  }

  return (
    <section aria-label="Join requests">
      <Intro>People asking to join. Approving lets them in straight away; declining tells them, and they can ask again later.</Intro>
      {requests === null ? (
        <div className="space-y-3">
          <Skeleton shape="block" className="h-12 w-full" />
          <Skeleton shape="block" className="h-12 w-full" />
        </div>
      ) : requests === "error" ? (
        <div className="flex items-center gap-3 text-body-sm text-secondary">
          Couldn&apos;t load the requests.
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRequests(null);
              setReloadKey((k) => k + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : requests.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-tertiary">No one is waiting to join.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
          {requests.map((request) => {
            const name = request.displayName ?? request.username ?? "Member";
            return (
              <li key={request.userId} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <EntityAvatar imageUrl={null} name={name} seed={request.userId} size={36} />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-body-sm font-medium text-primary">{name}</p>
                    <p className="text-caption text-tertiary">Asked {new Date(request.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <ConfirmButton onConfirm={() => void decide(request.userId, "reject")} question="Decline?" confirmLabel="Decline" pending={busy === request.userId}>
                      Decline
                    </ConfirmButton>
                    <Button variant="primary" size="sm" loading={busy === request.userId} onClick={() => void decide(request.userId, "approve")}>
                      Approve
                    </Button>
                  </span>
                </div>
                {request.message && <p className="ml-12 mt-2 border-l-2 border-white/10 pl-3 text-body-sm text-secondary">{request.message}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-caption text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function DeleteSection({ group }: { group: GroupDetail }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't delete this community. Check your connection and try again.");
      setDeleting(false);
      return;
    }
    router.push("/?section=communities");
    router.refresh();
  }

  const members = group.members.length;
  return (
    <section aria-label="Delete">
      <Intro>Deleting can&apos;t be undone.</Intro>
      <ul className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
        <SettingRow
          title={`Delete ${group.name}`}
          description={`Every post, comment, prediction round and score goes, for all ${members} ${members === 1 ? "member" : "members"}, and each of them is told. Points already spent on rounds aren't refunded.`}
        >
          <ConfirmButton onConfirm={() => void remove()} question="Delete for good?" confirmLabel="Delete" pending={deleting}>
            Delete community
          </ConfirmButton>
        </SettingRow>
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-caption text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
