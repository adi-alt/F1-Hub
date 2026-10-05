"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { MobileNav } from "@/components/MobileNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { Skeleton } from "@/components/ui/LegacySkeleton";
import { permissionsForRole } from "@/lib/rbac";
import { navSectionFor, type NavSection } from "@/lib/navSections";
import { seasonHref } from "@/lib/routes";

// The real nav's own link widths, so the loading skeleton reserves exactly the space the real
// links will occupy - no layout shift once /api/auth/me resolves either way.
const NAV_SKELETON_WIDTHS = ["w-12", "w-14", "w-14", "w-12"];

/** A header nav link: full header height, so the active item's brand underline sits on the
 * header's bottom edge, and aria-current="page" so the active section is announced too. */
function NavLink({ href, section, active, tour, children }: { href: string; section: NavSection; active: NavSection | null; tour: string; children: ReactNode }) {
  const current = section === active;
  return (
    <Link
      href={href}
      data-tour={tour}
      aria-current={current ? "page" : undefined}
      className={`relative flex h-16 items-center transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        current ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand" : ""
      }`}
    >
      {children}
    </Link>
  );
}

export function Header({ season }: { season: number }) {
  const { isAuthorized, loading, role } = useAuth();
  const permissions = role ? permissionsForRole(role) : null;
  const showUsers = !!permissions?.canViewUsers;
  const showModels = !!permissions?.canAccessAdmin;
  const activeSection = navSectionFor(usePathname());

  // z-header (the token scale): above the page, below dialogs and sheets, whose scrim has to dim it.
  return (
    <header className="sticky top-0 z-header h-16 shrink-0 border-b border-[var(--f1-line)] bg-[var(--f1-carbon)]/90 backdrop-blur">
      {/* The same frame and gutters as every page (page-wide), so the logo shares their left edge. */}
      <div className="page-wide relative flex h-full items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight transition hover:opacity-80">
          <span className="inline-block h-5 w-1.5 rounded-full bg-[var(--f1-red)]" />
          F1 HUB
        </Link>
        {/* Gated on isAuthorized, not raw Firebase auth state — someone mid-way through the OTP
            dialog shouldn't see nav links light up before they've actually cleared it. Every one
            of these pages immediately shows a sign-in gate anyway, so a link to them for a
            genuinely signed-out visitor is a dead end, not a shortcut.
            While auth is still resolving (a hard refresh - loading is true until /api/auth/me
            answers) we don't yet know which of those two cases we're in, so the real nav is
            replaced with same-shaped skeleton bars rather than nothing - the common case is a
            returning signed-in visitor, and this is what stops the header reading as broken/empty
            for the ~100-300ms that takes. Once resolved, it's either the real nav (isAuthorized)
            or nothing at all (a confirmed guest) - never a skeleton that outlives the real answer. */}
        {loading ? (
          <nav aria-hidden className="hidden items-center gap-6 sm:flex">
            {NAV_SKELETON_WIDTHS.map((w, i) => (
              <Skeleton key={i} className={`skeleton-shimmer h-3.5 ${w} rounded`} />
            ))}
          </nav>
        ) : (
          isAuthorized && (
            <nav aria-label="Main" data-tour="global-nav" className="hidden items-center gap-6 text-sm font-medium text-neutral-300 sm:flex">
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
          )
        )}
        <div className="flex items-center gap-3">
          <MobileNav season={season} showUsers={showUsers} showModels={showModels} showNav={isAuthorized} />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
