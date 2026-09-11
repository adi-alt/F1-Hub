"use client";

import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { MobileNav } from "@/components/MobileNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { permissionsForRole } from "@/lib/rbac";
import { seasonHref } from "@/lib/routes";

// The real nav's own link widths, so the loading skeleton reserves exactly the space the real
// links will occupy - no layout shift once /api/auth/me resolves either way.
const NAV_SKELETON_WIDTHS = ["w-12", "w-14", "w-14", "w-12"];

export function Header() {
  const { isAuthorized, loading, role } = useAuth();
  const permissions = role ? permissionsForRole(role) : null;
  const showUsers = !!permissions?.canViewUsers;
  const showModels = !!permissions?.canAccessAdmin;

  return (
    <header className="relative z-50 h-16 shrink-0 border-b border-[var(--f1-line)] bg-[var(--f1-carbon)]/90 backdrop-blur">
      <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
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
            <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-300 sm:flex">
              <Link href={seasonHref(2026)} className="transition hover:text-white">
                Season
              </Link>
              <Link href="/circuits" className="transition hover:text-white">
                Circuits
              </Link>
              <Link href="/archive" className="transition hover:text-white">
                Archive
              </Link>
              <Link href="/groups" className="transition hover:text-white">
                Groups
              </Link>
              {showUsers && (
                <Link href="/users" className="transition hover:text-white">
                  Users
                </Link>
              )}
              {showModels && (
                <Link href="/models" className="transition hover:text-white">
                  Models
                </Link>
              )}
            </nav>
          )
        )}
        <div className="flex items-center gap-3">
          <MobileNav showUsers={showUsers} showModels={showModels} showNav={isAuthorized} />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
