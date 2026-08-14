"use client";

import { useState } from "react";
import { useUserSearch, useUsersList, useSetUserRole } from "../queries/useUsers";
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
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const usersList = useUsersList(initialUsers, initialCursor);
  const searchQuery = useUserSearch(search);
  const setRole = useSetUserRole();

  const users = usersList.data?.pages.flatMap((p) => p.users) ?? initialUsers;
  const searchResult = search.trim() ? (searchQuery.data ?? null) : null;
  const rows = searchResult ?? users;

  async function changeRole(uid: string, role: "admin" | "moderator" | null) {
    setPending(uid);
    try {
      await setRole.mutateAsync({ uid, role });
    } finally {
      setPending(null);
    }
  }

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
                    onClick={() => void changeRole(user.uid, null)}
                    disabled={pending === user.uid}
                    className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    {pending === user.uid ? "…" : "Remove"}
                  </button>
                )
              ) : (
                <>
                  <button
                    onClick={() => void changeRole(user.uid, "moderator")}
                    disabled={pending === user.uid}
                    className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    {pending === user.uid ? "…" : user.role === "moderator" ? "Remove mod" : "Make moderator"}
                  </button>
                  <button
                    onClick={() => void changeRole(user.uid, "admin")}
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
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Find a user by exact email…"
        className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-white/30 focus:outline-none"
      />
      {(setRole.isError || usersList.isError || searchQuery.isError) && (
        <p className="text-sm text-red-400">Something went wrong. Try again.</p>
      )}
      {searchQuery.isFetching && <p className="text-xs text-neutral-500">Searching…</p>}
      {searchResult !== null && searchResult.length === 0 && !searchQuery.isFetching && (
        <p className="text-xs text-neutral-500">No user with that exact email.</p>
      )}

      <div className="space-y-2">{rows.map(renderRow)}</div>

      {searchResult === null && usersList.hasNextPage && (
        <button
          onClick={() => void usersList.fetchNextPage()}
          disabled={usersList.isFetchingNextPage}
          className="w-full rounded-lg border border-[var(--f1-line)] py-2 text-sm text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          {usersList.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
