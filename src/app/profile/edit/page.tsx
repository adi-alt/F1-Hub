"use client";

import Link from "next/link";
import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { SignInGate } from "@/components/auth/SignInGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";

export default function EditProfilePage() {
  const { user, loading } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <SignInGate label="your profile" />
      </div>
    );
  }

  async function save() {
    if (!auth.currentUser) return;
    setSaving(true);
    setError(null);
    try {
      // Firebase Auth stays the single source of truth for display name — no separate copy on
      // users/{uid} to drift out of sync with it.
      await updateProfile(auth.currentUser, { displayName });
      const idToken = await auth.currentUser.getIdToken(true);
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Edit profile</h1>

      <div className="mt-8 space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Email</p>
          <p className="text-sm text-neutral-500">{user.email} (from Google, not editable here)</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
