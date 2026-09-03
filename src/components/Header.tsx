"use client";

import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { MobileNav } from "@/components/MobileNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { permissionsForRole } from "@/lib/rbac";
import { seasonHref } from "@/lib/routes";

/** The group-predictions wallet balance (lib/supabase/points.ts), visible app-wide rather than
 * repeated on the Groups page itself - kept deliberately quiet (neutral border/text, no bright
 * yellow "coin" styling) so it reads as a small utility readout next to the profile menu, not a
 * gamified badge competing with the red accent everywhere else in this header. Renders nothing
 * while the balance hasn't loaded yet (null) - there's nothing wrong to show, just nothing to show
 * yet, same as the rest of this header already treats its own loading gaps. */
function PointsBadge() {
  const { pointsBalance } = useAuth();
  if (pointsBalance === null) return null;
  return (
    <Link
      href="/groups"
      className="hidden items-center gap-1.5 rounded-full border border-[var(--f1-line)] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-white/20 hover:text-white sm:flex"
      title="Group prediction points"
    >
      <svg viewBox="0 0 20 20" className="h-3 w-3 text-neutral-500" fill="none" aria-hidden>
        <path d="M10 2 12.2 7.6 18 8.4 13.8 12.3 15 18 10 15 5 18 6.2 12.3 2 8.4 7.8 7.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
      <span className="font-mono">{pointsBalance}</span> pts
    </Link>
  );
}

export function Header() {
  const { isAuthorized, role } = useAuth();
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
            genuinely signed-out visitor is a dead end, not a shortcut. */}
        {isAuthorized && (
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
        )}
        <div className="flex items-center gap-3">
          {isAuthorized && <PointsBadge />}
          <MobileNav showUsers={showUsers} showModels={showModels} showNav={isAuthorized} />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
