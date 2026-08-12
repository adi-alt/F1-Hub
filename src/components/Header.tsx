import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { seasonHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";
import { isAdmin } from "@/lib/session/isAdmin";

export async function Header() {
  const session = await getSession();
  const admin = await isAdmin(session.uid);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--f1-line)] bg-[var(--f1-carbon)]/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight transition hover:opacity-80">
          <span className="inline-block h-5 w-1.5 rounded-full bg-[var(--f1-red)]" />
          F1 HUB
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-300 sm:flex">
          <Link href={seasonHref(2026)} className="transition hover:text-white">
            Season
          </Link>
          <Link href="/circuits" className="transition hover:text-white">
            Circuits
          </Link>
          {admin && (
            <Link href="/admin" className="transition hover:text-white">
              Admin
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <MobileNav showAdmin={admin} />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
