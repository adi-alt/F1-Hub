"use client";

import { useAuth } from "./AuthProvider";
import { ProfileMenu } from "./ProfileMenu";

export function SignInButton() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />;
  }

  if (user) return <ProfileMenu />;

  // Both buttons trigger the same Google flow for now — sign in and sign up are meant to diverge
  // later (a lighter-weight return-visit flow vs. a fuller new-account one), but that behavior
  // hasn't been specified yet, so this is the shell for it rather than the real thing.
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void signInWithGoogle()}
        className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:text-white"
      >
        Sign in
      </button>
      <button
        onClick={() => void signInWithGoogle()}
        className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
      >
        Sign up
      </button>
    </div>
  );
}
