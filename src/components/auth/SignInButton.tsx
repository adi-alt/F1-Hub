"use client";

import { useAuth } from "./AuthProvider";
import { ProfileMenu } from "./ProfileMenu";

export function SignInButton() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />;
  }

  if (user) return <ProfileMenu />;

  return (
    <button
      onClick={() => void signInWithGoogle()}
      className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
    >
      Sign in with Google
    </button>
  );
}
