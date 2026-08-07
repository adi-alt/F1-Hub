"use client";

import Image from "next/image";
import { useAuth } from "./AuthProvider";

export function SignInButton() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />;
  }

  if (user) {
    return (
      <button
        onClick={() => void signOut()}
        className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/5"
      >
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt=""
            width={28}
            height={28}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--f1-red)] text-xs font-bold">
            {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={() => void signInWithGoogle()}
      className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
    >
      Sign in with Google
    </button>
  );
}
