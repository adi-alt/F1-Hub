"use client";

import { useState } from "react";
import type { UserProfile } from "@/lib/firestore/users";

export function UserManagement({ users, currentUid }: { users: UserProfile[]; currentUid: string }) {
  const [rows, setRows] = useState(users);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setRole(uid: string, role: "admin" | null) {
    setPending(uid);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setRows((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: role ?? undefined } : u)));
    } catch {
      setError("Failed to update role.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rows.map((user) => (
        <div
          key={user.uid}
          className="flex items-center justify-between gap-4 rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2.5"
        >
          <div>
            <p className="text-sm font-medium text-white">{user.displayName ?? user.email ?? user.uid}</p>
            <p className="text-xs text-neutral-500">{user.email}</p>
          </div>
          {user.role === "admin" ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--f1-red)]/20 px-2.5 py-1 text-xs font-medium text-[var(--f1-red)]">
                Admin
              </span>
              {user.uid !== currentUid && (
                <button
                  onClick={() => void setRole(user.uid, null)}
                  disabled={pending === user.uid}
                  className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                >
                  {pending === user.uid ? "…" : "Remove"}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => void setRole(user.uid, "admin")}
              disabled={pending === user.uid}
              className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
            >
              {pending === user.uid ? "…" : "Make admin"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
