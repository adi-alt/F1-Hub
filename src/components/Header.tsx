"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Timer } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { MobileNav } from "@/components/MobileNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { ApexMark } from "@/components/brand/ApexMark";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { headerStatus, shortRaceName, type HeaderSession } from "@/lib/headerSchedule";
import { permissionsForRole } from "@/lib/rbac";
import { navSectionFor, type NavSection } from "@/lib/navSections";
import { raceHref, seasonHref } from "@/lib/routes";

// The real nav's own link widths, so the loading skeleton reserves exactly the space the real
// links will occupy - no layout shift once /api/auth/me resolves either way.
const NAV_SKELETON_WIDTHS = ["w-12", "w-14", "w-14", "w-20"];

/** A header nav link: full header height, so the active item's brand underline sits on the
 * header's bottom edge, and aria-current="page" so the active section is announced too. */
function NavLink({ href, section, active, tour, children }: { href: string; section: NavSection; active: NavSection | null; tour: string; children: ReactNode }) {
  const current = section === active;
  return (
    <Link
      href={href}
      data-tour={tour}
      aria-current={current ? "page" : undefined}
      className={`relative flex h-14 items-center transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        current ? "text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand" : ""
      }`}
    >
      {children}
    </Link>
  );
}

/** The F1 version of a menu bar's clock: the session running now, else the next one with its countdown, linking to
 * that race. Re-read once a minute; nothing at all between seasons. The countdown is the same on the server and in
 * the browser unless a minute ticks over in between, hence suppressHydrationWarning on the text. */
function SessionStatus({ sessions }: { sessions: HeaderSession[] }) {
  const status = headerStatus(sessions, useMinuteClock());
  if (!status) return null;
  const { session } = status;
  return (
    <Link
      href={raceHref(session.year, session.round, session.race)}
      className="hidden items-center gap-2 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring xl:flex"
    >
      {status.kind === "live" ? (
        <span className="flex items-center gap-1.5 font-semibold text-primary">
          <span aria-hidden className="size-1.5 rounded-full bg-brand motion-safe:animate-pulse" />
          Live
        </span>
      ) : (
        <Icon icon={Timer} size={16} className="text-tertiary" />
      )}
      <span suppressHydrationWarning className="tabular whitespace-nowrap">
        {shortRaceName(session.race)} · {session.label}
        {status.kind === "next" ? ` in ${status.countdown}` : ""}
      </span>
    </Link>
  );
}

/**
 * The site header, laid out like a menu bar: the name and the sections on the left as plain text, the Apex mark in
 * the middle, and the race weekend's status and the account on the right. Below xl the mark takes the name's place
 * on the left. Everyone sees the sections - a signed-out visitor's link opens that section's sign-in page, which
 * says what's there (audit UX-S7); Users and Models only for the roles that can open them.
 */
export function Header({ season, sessions = [] }: { season: number; sessions?: HeaderSession[] }) {
  const { loading, role } = useAuth();
  const permissions = role ? permissionsForRole(role) : null;
  const showUsers = !!permissions?.canViewUsers;
  const showModels = !!permissions?.canAccessAdmin;
  const activeSection = navSectionFor(usePathname());

  // z-header (the token scale): above the page, below dialogs and sheets, whose scrim has to dim it.
  return (
    <header className="sticky top-0 z-header h-14 shrink-0 border-b border-subtle bg-[var(--f1-carbon)]/90 backdrop-blur">
      {/* The same frame and gutters as every page (page-wide), so the name shares their left edge. */}
      <div className="page-wide relative flex h-full items-center gap-6">
        <Link
          href="/"
          aria-label="F1 Hub, home"
          className="group flex shrink-0 items-center rounded-control text-primary transition-opacity duration-fast hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ApexMark size={22} className="xl:hidden" />
          <span className="hidden text-body-sm font-semibold tracking-tight xl:inline">F1 Hub</span>
        </Link>

        {/* While auth is still resolving (only without a server seed - see AuthProvider) the links that depend on the
            role aren't known yet, so same-shaped bars hold their place. */}
        {loading ? (
          <nav aria-hidden className="hidden items-center gap-5 md:flex">
            {NAV_SKELETON_WIDTHS.map((w, i) => (
              <Skeleton key={i} shape="block" className={`h-3.5 ${w}`} />
            ))}
          </nav>
        ) : (
          <nav aria-label="Main" data-tour="global-nav" className="hidden items-center gap-5 text-body-sm text-secondary md:flex">
            <NavLink href={seasonHref(season)} section="season" active={activeSection} tour="nav-season">
              Season
            </NavLink>
            <NavLink href="/circuits" section="circuits" active={activeSection} tour="nav-circuits">
              Circuits
            </NavLink>
            <NavLink href="/archive" section="archive" active={activeSection} tour="nav-archive">
              Archive
            </NavLink>
            <NavLink href="/groups" section="communities" active={activeSection} tour="nav-communities">
              Communities
            </NavLink>
            {showUsers && (
              <NavLink href="/users" section="users" active={activeSection} tour="nav-users">
                Users
              </NavLink>
            )}
            {showModels && (
              <NavLink href="/models" section="models" active={activeSection} tour="nav-models">
                Models
              </NavLink>
            )}
          </nav>
        )}

        {/* The mark, centred on the bar from xl, where there's room on both sides of it. A second way home, so it's
            left out of the tab order and the accessibility tree; the name's link carries it. */}
        <Link
          href="/"
          aria-hidden
          tabIndex={-1}
          className="group absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-primary xl:block"
        >
          <ApexMark size={24} />
        </Link>

        <div className="ml-auto flex items-center gap-4">
          <SessionStatus sessions={sessions} />
          <SignInButton />
          <MobileNav season={season} showUsers={showUsers} showModels={showModels} />
        </div>
      </div>
    </header>
  );
}
