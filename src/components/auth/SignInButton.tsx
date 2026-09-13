"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProfileMenu } from "./ProfileMenu";

export function SignInButton() {
  const { isAuthorized, loading } = useAuth();
  const open = useAuthDialogStore((s) => s.open);

  // Shaped like the real ProfileMenu pill (avatar + name + points chip), not a generic gray box -
  // a hard refresh most often belongs to an already-signed-in visitor (their session cookie is
  // still valid, /api/auth/me just hasn't answered yet), so this is the shape that actually
  // resolves into for the common case, with no layout jump when it does.
  if (loading) {
    return (
      <div aria-hidden className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-1.5">
        <Skeleton className="skeleton-shimmer h-7 w-7 shrink-0 rounded-full" />
        <Skeleton className="skeleton-shimmer h-3.5 w-16 rounded" />
        <span className="border-l border-white/10 pl-2">
          <Skeleton className="skeleton-shimmer h-3.5 w-10 rounded" />
        </span>
      </div>
    );
  }

  // Gated on isAuthorized, not the raw Firebase user - Firebase's own auth state goes truthy the
  // instant the popup/email-password call resolves, well before OTP, and this must not show a
  // signed-in profile menu for someone who hasn't cleared that step yet.
  if (isAuthorized) return <ProfileMenu />;

  // Both buttons open the same shared dialog (see store/useAuthDialogStore) — the flow itself
  // works out whether this is a returning account or a new one, so there's nothing left for the
  // two buttons to actually diverge on.
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={open}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:text-white"
      >
        Sign in
      </button>
      <button
        onClick={open}
        className="rounded-lg bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
      >
        Sign up
      </button>
    </div>
  );
}
