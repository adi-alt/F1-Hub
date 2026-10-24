"use client";

import { PANEL } from "@/components/ui/panel";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, sortRows, type TableColumn, type TableSort } from "@/components/ui/Table";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { InviteDialog } from "./InviteUsers";
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-caption font-medium ${
        onboarded ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${onboarded ? "bg-emerald-400" : "bg-amber-400"}`} />
      {onboarded ? "Onboarded" : "Pending"}
    </span>
  );
}

function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton shape="circle" className="h-8 w-8 shrink-0" />
          <Skeleton shape="block" className="h-3.5 w-32" />
          <Skeleton shape="block" className="h-3.5 w-40" />
          <Skeleton shape="block" className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function UserManagement({ initialUsers, initialCursor, currentUid, canManageRoles, counts }: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sort, setSort] = useState<TableSort>({ key: "joined", direction: "descending" });
  const [pending, setPending] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Realtime sync for this list is handled app-wide by AppRealtimeSync (its admin `profiles`
  // listener invalidates usersKeys on any change) — no per-page channel needed here.
  const usersList = useUsersList(initialUsers, initialCursor);
  const setRole = useSetUserRole();

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

  const filtered = useMemo(
    () =>
      matched.filter((u) => {
        if (roleFilter === "all") return true;
        if (roleFilter === "member") return !u.role;
        return u.role === roleFilter;
      }),
    [matched, roleFilter],
  );

  const columns: TableColumn<UserProfile>[] = [
    {
      key: "name",
      header: "User",
      sortable: true,
      sortValue: displayNameFor,
      render: (user) => {
        const name = displayNameFor(user);
        return (
          <div className="flex items-center gap-3">
            <span className="shrink-0">
              <PersonAvatar id={user.uid} avatar={user.avatar} size={32} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-primary">
                {name}
                {user.uid === currentUid && <span className="ml-2 text-caption font-normal text-tertiary">You</span>}
              </p>
              {user.username && <p className="truncate text-caption font-normal text-tertiary">@{user.username}</p>}
            </div>
          </div>
        );
      },
    },
    { key: "email", header: "Email", hideBelow: "md", render: (user) => <span className="text-secondary">{user.email ?? "—"}</span> },
    { key: "status", header: "Status", render: (user) => <StatusBadge onboarded={isOnboarded(user)} /> },
    {
      key: "role",
      header: "Role",
      sortable: true,
      // Most-privileged first on the first click.
      firstSortDirection: "ascending",
      sortValue: (user) => ROLE_RANK[user.role ?? "member"],
      render: (user) =>
        canManageRoles ? (
          <RoleSelect
            value={user.role ?? null}
            onChange={(role) => void changeRole(user.uid, role)}
            pending={pending === user.uid}
            disabled={user.uid === currentUid}
            disabledReason="You can't change your own role — ask another admin."
          />
        ) : (
          <span className="text-secondary">{roleLabel(user.role ?? null)}</span>
        ),
    },
    {
      key: "joined",
      header: "Joined",
      sortable: true,
      firstSortDirection: "descending",
      sortValue: (user) => new Date(user.createdAt).getTime(),
      render: (user) => <span className="tabular text-secondary">{joinedLabel(user.createdAt)}</span>,
    },
  ];
  // Sorted here too (not only inside Table) so the export follows the on-screen order.
  const rows = sortRows(filtered, columns, sort);

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

  const roleTabs: TabItem<RoleFilter>[] = [
    { value: "all", label: "All" },
    { value: "admin", label: "Admins" },
    { value: "moderator", label: "Moderators" },
    { value: "member", label: "Members" },
  ];

  return (
    <div className="space-y-5">
      <Tabs variant="segmented" value={roleFilter} onValueChange={setRoleFilter} items={roleTabs}>
        <div className={`overflow-hidden ${PANEL}`}>
          <div className="flex flex-col gap-4 border-b border-[var(--f1-line)] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5 text-tertiary">
                <circle cx="9" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3.5 19c0-3.1 2.6-5.2 5.5-5.2s5.5 2.1 5.5 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="17.5" cy="7.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                <path d="M16 19c.2-2.3 1.8-4 4-4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <h2 className="text-base font-semibold text-white">
                Users <span className="text-tertiary">({headerCount.toLocaleString()})</span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Segmented: the role is a compact filter over the one table below, not navigation.
                  Every control in this row is 36px tall - the segmented tabs by construction, the
                  search and ⋮ with h-9 - so they sit on one baseline instead of each finding its own
                  height from its own padding. */}
              <TabList aria-label="Role" />

              <div className="relative">
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary"
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
                  className="h-9 w-full rounded-lg border border-[var(--f1-line)] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-tertiary focus:border-white/20 focus:outline-none sm:w-56"
                />
              </div>

              {/* Last in the row, hard against the right edge. Invite lives in here rather than as a
                  standing button beside the filters - it's an occasional administrative act, not
                  something that needs permanent shelf space in the toolbar. */}
              <ExportMenu
                filename="users"
                getRows={exportRows}
                getImage={async () => tableToCanvas(exportRows().columns, exportRows().rows)}
                triggerClassName="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--f1-line)] text-neutral-400 transition hover:border-white/25 hover:text-white"
                extraItems={canManageRoles ? [{ label: "Invite people…", onClick: () => setInviteOpen(true) }] : undefined}
              />
            </div>
          </div>

          {canManageRoles && <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />}

          {(setRole.isError || usersList.isError || serverSearch.isError) && (
            <p className="border-b border-[var(--f1-line)] bg-[var(--f1-red)]/[0.08] px-4 py-2 text-sm text-red-300">
              Something went wrong. Try again.
            </p>
          )}

          <TabPanels className="max-h-[520px] overflow-auto scrollbar-subtle">
            {showSkeleton ? (
              <div className="p-4">
                <RowsSkeleton />
              </div>
            ) : (
              rows.length > 0 && (
                <Table columns={columns} rows={rows} getRowKey={(user) => user.uid} caption="Users" sort={sort} onSortChange={setSort} />
              )
            )}

            {!showSkeleton && rows.length === 0 && (
              <EmptyState
                icon={Users}
                message={
                  isSearching
                    ? "No account matches that search, loaded here or not: try a shorter term or part of an email."
                    : "No account currently holds this role."
                }
              />
            )}
          </TabPanels>

          {/* Footer only exists when there's genuinely another page to pull - the running
              "Loaded n of n" tally it used to carry restated the count already in this card's own
              heading, so an otherwise-empty bar sat under every table that fits on one page. */}
          {!isSearching && usersList.hasNextPage && (
            <div className="flex items-center justify-center border-t border-[var(--f1-line)] px-4 py-3">
              <button
                onClick={() => void usersList.fetchNextPage()}
                disabled={usersList.isFetchingNextPage}
                className="rounded-lg border border-[var(--f1-line)] px-4 py-1.5 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
              >
                {usersList.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
