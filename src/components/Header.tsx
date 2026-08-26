"use client";

import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { MobileNav } from "@/components/MobileNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { permissionsForRole } from "@/lib/rbac";
import { seasonHref } from "@/lib/routes";

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
            <Link href="/news" className="transition hover:text-white">
              News
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
          <MobileNav showUsers={showUsers} showModels={showModels} showNav={isAuthorized} />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
