"use client";

import Link from "next/link";
import { useState } from "react";
import { SignInGate } from "@/components/auth/SignInGate";
import { useAuth } from "@/providers/AuthProvider";

export default function EditProfilePage() {
  const { user, displayName, setDisplayName, isAuthorized, loading } = useAuth();
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (!isAuthorized || !user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <SignInGate label="your profile" />
      </div>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // "Display name" here is the profile's own firstName (see createSession.ts) — the same
      // field the OTP-gated signup step collects, kept as the single source of truth rather than
      // a separate copy that could drift out of sync with it.
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: name }),
      });
      if (!res.ok) throw new Error();
      setDisplayName(name);
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Email</p>
          <p className="text-sm text-neutral-500">{user.email} (not editable here)</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={() => void save()}
          disabled={saving || !name.trim()}
          className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
