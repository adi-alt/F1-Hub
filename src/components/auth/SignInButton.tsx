"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { ProfileMenu } from "./ProfileMenu";

export function SignInButton() {
  const { isAuthorized, loading } = useAuth();
  const open = useAuthDialogStore((s) => s.open);

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />;
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
        className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:text-white"
      >
        Sign in
      </button>
      <button
        onClick={open}
        className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
      >
        Sign up
      </button>
    </div>
  );
}
