"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { ProfileMenu } from "./ProfileMenu";
import { AuthDialog } from "./AuthDialog";

export function SignInButton() {
  const { user, loading } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />;
  }

  if (user) return <ProfileMenu />;

  // Both buttons open the same dialog — the flow itself works out whether this is a returning
  // account or a new one, so there's nothing left for the two buttons to actually diverge on.
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:text-white"
        >
          Sign in
        </button>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-full bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
        >
          Sign up
        </button>
      </div>
      {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}
