"use client";

import { useCallback, useState } from "react";
import type { UserProfile } from "@/lib/firestore/users";

type Props = {
  initialUsers: UserProfile[];
  initialCursor: string | null;
  currentUid: string;
  /** Moderators can see this list but not change anyone's role. */
  canManageRoles: boolean;
};

function RoleBadge({ role }: { role: UserProfile["role"] }) {
  if (!role) return null;
  const label = role === "admin" ? "Admin" : "Moderator";
  return (
    <span className="rounded-full bg-[var(--f1-red)]/20 px-2.5 py-1 text-xs font-medium text-[var(--f1-red)]">
      {label}
    </span>
  );
}

export function UserManagement({ initialUsers, initialCursor, currentUid, canManageRoles }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<UserProfile[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function setRole(uid: string, role: "admin" | "moderator" | null) {
    setPending(uid);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const apply = (list: UserProfile[]) => list.map((u) => (u.uid === uid ? { ...u, role: role ?? undefined } : u));
      setUsers(apply);
      setSearchResult((prev) => (prev ? apply(prev) : prev));
    } catch {
      setError("Failed to update role.");
    } finally {
      setPending(null);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/users?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const body = (await res.json()) as { users: UserProfile[]; nextCursor: string | null };
      setUsers((prev) => [...prev, ...body.users]);
      setCursor(body.nextCursor);
    } catch {
      setError("Failed to load more users.");
    } finally {
      setLoadingMore(false);
    }
  }

  const runSearch = useCallback(async (email: string) => {
    if (!email.trim()) {
      setSearchResult(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users?email=${encodeURIComponent(email.trim())}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const body = (await res.json()) as { users: UserProfile[] };
      setSearchResult(body.users);
    } catch {
      setError("Search failed.");
    } finally {
      setSearching(false);
    }
  }, []);

  const rows = searchResult ?? users;

  function renderRow(user: UserProfile) {
    return (
      <div
        key={user.uid}
        className="flex items-center justify-between gap-4 rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2.5"
      >
        <div>
          <p className="text-sm font-medium text-white">{user.displayName ?? user.email ?? user.uid}</p>
          <p className="text-xs text-neutral-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={user.role} />
          {canManageRoles && (
            <>
              {user.role === "admin" ? (
                user.uid !== currentUid && (
                  <button
                    onClick={() => void setRole(user.uid, null)}
                    disabled={pending === user.uid}
                    className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    {pending === user.uid ? "…" : "Remove"}
                  </button>
                )
              ) : (
                <>
                  <button
                    onClick={() => void setRole(user.uid, "moderator")}
                    disabled={pending === user.uid}
                    className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    {pending === user.uid ? "…" : user.role === "moderator" ? "Remove mod" : "Make moderator"}
                  </button>
                  <button
                    onClick={() => void setRole(user.uid, "admin")}
                    disabled={pending === user.uid}
                    className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    {pending === user.uid ? "…" : "Make admin"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          void runSearch(e.target.value);
        }}
        placeholder="Find a user by exact email…"
        className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-white/30 focus:outline-none"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {searching && <p className="text-xs text-neutral-500">Searching…</p>}
      {searchResult !== null && searchResult.length === 0 && !searching && (
        <p className="text-xs text-neutral-500">No user with that exact email.</p>
      )}

      <div className="space-y-2">{rows.map(renderRow)}</div>

      {searchResult === null && cursor && (
        <button
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="w-full rounded-lg border border-[var(--f1-line)] py-2 text-sm text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
