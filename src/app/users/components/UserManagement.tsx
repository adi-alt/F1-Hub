"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { tableToCanvas } from "@/lib/export";
import type { UserCounts, UserProfile } from "@/lib/supabase/users";
import { MIN_SEARCH_LENGTH, useDebounced, useSetUserRole, useUserSearch, useUsersList } from "../_hooks/useUsers";
import { RoleSelect, roleLabel, type RoleValue } from "./RoleSelect";

type Props = {
  initialUsers: UserProfile[];
  initialCursor: string | null;
  currentUid: string;
  /** Moderators can see this list but not change anyone's role. */
  canManageRoles: boolean;
  counts: UserCounts;
};

type RoleFilter = "all" | "admin" | "moderator" | "member";
type SortKey = "name" | "role" | "joined";
type SortDir = "asc" | "desc";

const HEADER_CLASS = "text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md border-b border-white/[0.08]";
// A sticky header needs real opacity behind its blur or rows scrolling underneath bleed through.
// Same token every other sticky/floating surface in the app already uses.
const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

/** Sort weight for the role column: most-privileged first on `asc`, so "sort by role" puts
 * admins at the top, which is the only ordering anyone actually wants from this column. */
const ROLE_RANK: Record<string, number> = { admin: 0, moderator: 1, member: 2 };

function displayNameFor(user: UserProfile): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return user.displayName ?? (full || user.username || user.email || user.uid);
}

function joinedLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** A user is "onboarded" once they've finished (or dismissed) the homepage tour — the same
 * one-way stamp OnboardingTour reads. Everyone else has an account but has never completed the
 * first-run flow, which is exactly the Pending/Joined split this table's header count implies. */
function isOnboarded(user: UserProfile): boolean {
  return !!user.onboardingCompletedAt;
}

/** Status is a *state*, so it gets the reserved good/pending treatment rather than a categorical
 * hue — and it always ships with its label, never the dot alone, so it survives colorblindness,
 * grayscale print and forced-colors mode. */
function StatusBadge({ onboarded }: { onboarded: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        onboarded ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${onboarded ? "bg-emerald-400" : "bg-amber-400"}`} />
      {onboarded ? "Onboarded" : "Pending"}
    </span>
  );
}

function sortIndicator(key: SortKey, sortKey: SortKey, sortDir: SortDir) {
  if (key !== sortKey) return null;
  return <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <tbody className="divide-y divide-[var(--f1-line)]">
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </td>
          <td className="px-4 py-3"><Skeleton className="h-3.5 w-40" /></td>
          <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
          <td className="px-4 py-3"><Skeleton className="h-8 w-32 rounded-lg" /></td>
          <td className="px-4 py-3"><Skeleton className="h-3.5 w-24" /></td>
        </tr>
      ))}
    </tbody>
  );
}

export function UserManagement({ initialUsers, initialCursor, currentUid, canManageRoles, counts }: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pending, setPending] = useState<string | null>(null);

  // Realtime sync for this list is handled app-wide by AppRealtimeSync (its admin `profiles`
  // listener invalidates usersKeys on any change) — no per-page channel needed here.
  const usersList = useUsersList(initialUsers, initialCursor);
  const setRole = useSetUserRole();
  const scrollRef = useNestedLenisScroll(search);

  const loaded = useMemo(() => usersList.data?.pages.flatMap((p) => p.users) ?? initialUsers, [usersList.data, initialUsers]);

  const term = search.trim().toLowerCase();
  const isSearching = term.length >= MIN_SEARCH_LENGTH;

  // The local filter runs on every keystroke against the pages already in memory — instant, no
  // network. Only when it finds nothing does the server search come into play (below), for the
  // case where the person exists but simply hasn't been paged in yet.
  const localMatches = useMemo(() => {
    if (!isSearching) return loaded;
    return loaded.filter((u) =>
      [u.displayName, u.email, u.username, u.firstName, u.lastName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term)),
    );
  }, [loaded, term, isSearching]);

  const debouncedTerm = useDebounced(search.trim(), 300);
  const settled = debouncedTerm.toLowerCase() === term;
  const noLocalMatch = isSearching && localMatches.length === 0;
  const needsServerSearch = noLocalMatch && settled;
  const serverSearch = useUserSearch(debouncedTerm, needsServerSearch);
  const usedServer = needsServerSearch && (serverSearch.data?.length ?? 0) > 0;

  const matched = usedServer ? serverSearch.data! : localMatches;

  const rows = useMemo(() => {
    const filtered = matched.filter((u) => {
      if (roleFilter === "all") return true;
      if (roleFilter === "member") return !u.role;
      return u.role === roleFilter;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return dir * displayNameFor(a).localeCompare(displayNameFor(b));
      if (sortKey === "role") return dir * (ROLE_RANK[a.role ?? "member"] - ROLE_RANK[b.role ?? "member"]);
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, [matched, roleFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Names read naturally A→Z; dates and privilege read best with the most notable end first.
    setSortDir(key === "name" ? "asc" : "desc");
  }

  async function changeRole(uid: string, role: RoleValue) {
    setPending(uid);
    try {
      await setRole.mutateAsync({ uid, role });
    } finally {
      setPending(null);
    }
  }

  const exportRows = () => ({
    columns: ["Name", "Username", "Email", "Status", "Role", "Joined"],
    rows: rows.map((u) => [
      displayNameFor(u),
      u.username ?? "",
      u.email ?? "",
      isOnboarded(u) ? "Onboarded" : "Pending",
      roleLabel(u.role ?? null),
      joinedLabel(u.createdAt),
    ]) as (string | number)[][],
  });

  // Header count: the roster total when nothing is narrowing the list, the visible count when
  // something is. Showing "1,284" above three filtered rows would just be wrong.
  const isNarrowed = isSearching || roleFilter !== "all";
  const headerCount = isNarrowed ? rows.length : counts.total;
  // Also covers the gap *before* the debounce settles: without that first clause the table would
  // flash "No users match that search" for ~300ms on every term that isn't already loaded, then
  // replace it with results — reporting a miss it hadn't actually checked for yet.
  const showSkeleton = noLocalMatch && (!settled || serverSearch.isFetching);

  const roleTabs: { value: RoleFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "admin", label: "Admins" },
    { value: "moderator", label: "Moderators" },
    { value: "member", label: "Members" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/50">
        <div className="flex flex-col gap-4 border-b border-[var(--f1-line)] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5 text-neutral-500">
              <circle cx="9" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3.5 19c0-3.1 2.6-5.2 5.5-5.2s5.5 2.1 5.5 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="17.5" cy="7.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 19c.2-2.3 1.8-4 4-4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h2 className="text-base font-semibold text-white">
              Users <span className="text-neutral-500">({headerCount.toLocaleString()})</span>
            </h2>
            <ExportMenu
              filename="users"
              getRows={exportRows}
              getImage={async () => tableToCanvas(exportRows().columns, exportRows().rows)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
              {roleTabs.map((tab) => {
                const active = roleFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setRoleFilter(tab.value)}
                    aria-pressed={active}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                      active ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
              >
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username or email…"
                aria-label="Search users"
                className="h-9 w-full rounded-lg border border-[var(--f1-line)] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none sm:w-64"
              />
            </div>
          </div>
        </div>

        {(setRole.isError || usersList.isError || serverSearch.isError) && (
          <p className="border-b border-[var(--f1-line)] bg-[var(--f1-red)]/[0.08] px-4 py-2 text-sm text-red-300">
            Something went wrong. Try again.
          </p>
        )}

        <div ref={scrollRef} className="max-h-[520px] overflow-auto scrollbar-hide">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={`sticky top-0 z-10 ${HEADER_CLASS}`} style={HEADER_STYLE}>
              <tr>
                <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("name")}>
                  User{sortIndicator("name", sortKey, sortDir)}
                </th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("role")}>
                  Role{sortIndicator("role", sortKey, sortDir)}
                </th>
                <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("joined")}>
                  Joined{sortIndicator("joined", sortKey, sortDir)}
                </th>
              </tr>
            </thead>

            {showSkeleton ? (
              <RowsSkeleton />
            ) : (
              <tbody className="divide-y divide-[var(--f1-line)]">
                <AnimatePresence initial={false}>
                  {rows.map((user) => {
                    const isSelf = user.uid === currentUid;
                    const name = displayNameFor(user);
                    return (
                      <motion.tr
                        key={user.uid}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="group transition hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="shrink-0">
                              <EntityAvatar imageUrl={null} name={name} seed={user.uid} size={32} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">
                                {name}
                                {isSelf && <span className="ml-2 text-[11px] font-normal text-neutral-500">You</span>}
                              </p>
                              {user.username && <p className="truncate text-xs text-neutral-500">@{user.username}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-neutral-400">{user.email ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge onboarded={isOnboarded(user)} />
                        </td>
                        <td className="px-4 py-3">
                          {canManageRoles ? (
                            <RoleSelect
                              value={user.role ?? null}
                              onChange={(role) => void changeRole(user.uid, role)}
                              pending={pending === user.uid}
                              disabled={isSelf}
                              disabledReason="You can't change your own role — ask another admin."
                            />
                          ) : (
                            <span className="text-sm text-neutral-400">{roleLabel(user.role ?? null)}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-neutral-400">
                          {joinedLabel(user.createdAt)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            )}
          </table>

          {!showSkeleton && rows.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={EmptyIcons.members}
                title={isSearching ? "No users match that search" : "No users in this view"}
                description={
                  isSearching
                    ? "Checked every account, not just the ones loaded here. Try a shorter term, or part of an email."
                    : "No account currently holds this role."
                }
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--f1-line)] px-4 py-3">
          <p className="text-xs text-neutral-500">
            {isNarrowed
              ? `Showing ${rows.length.toLocaleString()} of ${counts.total.toLocaleString()}`
              : `Loaded ${loaded.length.toLocaleString()} of ${counts.total.toLocaleString()}`}
            {usedServer && " · matched across all accounts"}
          </p>
          {!isSearching && usersList.hasNextPage && (
            <button
              onClick={() => void usersList.fetchNextPage()}
              disabled={usersList.isFetchingNextPage}
              className="rounded-full border border-[var(--f1-line)] px-4 py-1.5 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
            >
              {usersList.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
      </div>
    </div>
  );
}
