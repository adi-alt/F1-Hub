"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { useAuth } from "@/providers/AuthProvider";

/** The account's own details: the name shown across the site (the profile's firstName, the same field signup
 * collects - one source of truth) and the sign-in email, which isn't editable here. */
export function ProfileDetailsForm() {
  const { user, displayName, setDisplayName } = useAuth();
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const dirty = name.trim() !== (displayName ?? "").trim();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: name.trim() }) });
      if (!res.ok) throw new Error(`${res.status}`);
      setDisplayName(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={`max-w-xl p-5 ${PANEL}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && name.trim()) void save();
      }}
    >
      <div className="flex items-center gap-4">
        {user.photoURL ? (
          <Image src={user.photoURL} alt="" width={56} height={56} className="rounded-full" unoptimized />
        ) : (
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-title-md font-bold text-white">
            {(name || user.email || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-primary">{displayName ?? user.email}</p>
          <p className="truncate text-caption text-tertiary">{user.email}</p>
        </div>
      </div>

      <label htmlFor="display-name" className={`mt-6 block ${EYEBROW}`}>
        Display name
      </label>
      <input
        id="display-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        className="mt-2 h-10 w-full rounded-control border border-white/[0.08] bg-white/[0.02] px-3 text-body-sm text-primary placeholder:text-tertiary focus-visible:border-white/25 focus-visible:outline-2 focus-visible:outline-focus-ring"
      />
      <p className="mt-1.5 text-caption text-tertiary">Shown on your posts, picks and the league tables.</p>

      <p className={`mt-5 ${EYEBROW}`}>Email</p>
      <p className="mt-2 text-body-sm text-secondary">{user.email}</p>
      <p className="mt-1 text-caption text-tertiary">The address you sign in with. It can&apos;t be changed here.</p>

      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!dirty || !name.trim()}>
          {saved ? "Saved" : "Save changes"}
        </Button>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
