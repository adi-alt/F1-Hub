"use client";

import { useState } from "react";
import { LogOut, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { AvatarBuilder } from "@/components/avatar/AvatarBuilder";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Icon } from "@/components/ui/Icon";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { useProductTour } from "@/components/onboarding/ProductTour";
import { useAuth } from "@/providers/AuthProvider";

const INPUT =
  "mt-2 h-10 w-full rounded-control border border-white/[0.08] bg-white/[0.02] px-3 text-body-sm text-primary placeholder:text-tertiary focus-visible:border-white/25 focus-visible:outline-2 focus-visible:outline-focus-ring";

/**
 * Who you are on the site: first and last name (the first is what everyone sees on posts, picks and league tables;
 * the signup step collects both), the username and the sign-in email (both fixed here), when you joined, and the
 * account's actions. Saving sends only what changed.
 */
export function ProfileDetailsForm({ initial }: { initial: { firstName: string; lastName: string; username: string | null; memberSince: string; role: string | null } }) {
  const { user, avatar, setDisplayName, signOut } = useAuth();
  const [editingAvatar, setEditingAvatar] = useState(false);
  const { start: startTour } = useProductTour();
  const [first, setFirst] = useState(initial.firstName);
  const [last, setLast] = useState(initial.lastName);
  const [saved, setSaved] = useState({ first: initial.firstName, last: initial.lastName });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const patch: Record<string, string> = {};
  if (first.trim() !== saved.first) patch.firstName = first.trim();
  if (last.trim() !== saved.last) patch.lastName = last.trim();
  const dirty = Object.keys(patch).length > 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(`${res.status}`);
      if (patch.firstName) setDisplayName(patch.firstName);
      setSaved({ first: first.trim(), last: last.trim() });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Dialog open={editingAvatar} onClose={() => setEditingAvatar(false)} title="Edit avatar" size="2xl">
        {editingAvatar && (
          <AvatarBuilder
            layout="wide"
            onDone={() => setEditingAvatar(false)}
            secondary={
              <Button variant="ghost" size="sm" onClick={() => setEditingAvatar(false)}>
                Cancel
              </Button>
            }
          />
        )}
      </Dialog>
      <form
        className={`p-5 ${PANEL}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && first.trim()) void save();
        }}
      >
        <div className="flex items-center gap-4">
          <PersonAvatar id={user.uid} avatar={avatar} size={64} />
          <div className="min-w-0">
            <p className="truncate text-title-md text-primary">{[saved.first, saved.last].filter(Boolean).join(" ") || user.email}</p>
            {initial.username && <p className="truncate text-body-sm text-secondary">@{initial.username}</p>}
            <p className="text-caption text-tertiary">
              Member since {new Date(initial.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              {initial.role ? ` · ${initial.role[0].toUpperCase()}${initial.role.slice(1)}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <Button variant="secondary" size="sm" iconStart={Pencil} onClick={() => setEditingAvatar(true)}>
            Edit avatar
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={EYEBROW}>First name</span>
            <input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} autoComplete="given-name" className={INPUT} />
          </label>
          <label className="block">
            <span className={EYEBROW}>Last name</span>
            <input value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} autoComplete="family-name" className={INPUT} />
          </label>
        </div>
        <p className="mt-1.5 text-caption text-tertiary">Your first name is shown on your posts, picks and league tables.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className={EYEBROW}>Username</p>
            <p className="mt-2 text-body-sm text-secondary">{initial.username ? `@${initial.username}` : "Not set"}</p>
          </div>
          <div className="min-w-0">
            <p className={EYEBROW}>Email</p>
            <p className="mt-2 truncate text-body-sm text-secondary">{user.email}</p>
          </div>
        </div>
        <p className="mt-1.5 text-caption text-tertiary">Your username and sign-in email can&apos;t be changed here.</p>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!dirty || !first.trim()}>
            {done ? "Saved" : "Save changes"}
          </Button>
          {dirty && !saving && (
            <button
              type="button"
              onClick={() => {
                setFirst(saved.first);
                setLast(saved.last);
              }}
              className="rounded-control px-2 py-1 text-body-sm text-secondary transition-colors duration-fast hover:text-primary"
            >
              Discard
            </button>
          )}
          {error && (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          )}
        </div>
      </form>

      <section aria-labelledby="account-actions" className={`p-5 ${PANEL}`}>
        <h2 id="account-actions" className={EYEBROW}>
          Account
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconStart={Sparkles}
            onClick={() => {
              void fetch("/api/users/onboarding", { method: "DELETE" }).catch(() => {});
              startTour();
            }}
          >
            Replay the tour
          </Button>
          <Button variant="secondary" size="sm" iconStart={LogOut} onClick={() => void signOut()}>
            Log out
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-caption text-tertiary">
          <Icon icon={Sparkles} size={16} className="mt-px size-3.5" />
          The tour walks through the site again from the start; your picks, favourites and communities stay as they are.
        </p>
      </section>
    </div>
  );
}
