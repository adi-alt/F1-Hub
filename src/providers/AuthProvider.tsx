"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Role } from "@/lib/rbac";

// Deliberately not the Supabase `User` type - just the three fields anything here actually reads
// (ProfileMenu's avatar/email, PickPanel's uid for its own picks). Sourced from the session
// (iron-session), not a live Supabase object, so it's available the instant a session exists
// with no separate client-side Supabase call needed.
export type SessionUser = { uid: string; email: string | null; photoURL: string | null };

type AuthContextValue = {
  user: SessionUser | null;
  // True only once a real server session exists — set the moment otp/verify or complete-signup
  // actually mints one (AuthDialog calls setRole directly), or hydrated from an existing session
  // on page load via /api/auth/me. Being signed in to Supabase but not yet past the OTP step is
  // *not* authorized, on purpose: nothing sensitive should render for them until this flips true.
  role: Role | null;
  // The profile's own firstName (session-cached — see createSession.ts), not whatever name an
  // OAuth provider supplied: that's only ever set for a Google/GitHub account, so it's null for
  // every email/password account. This is the reliable "what do we call this person" source.
  displayName: string | null;
  isAuthorized: boolean;
  loading: boolean;
  setRole: (role: Role | null) => void;
  setDisplayName: (name: string | null) => void;
  setUser: (user: SessionUser | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Hydrates from whatever server session already exists (a normal persisted cookie) on first
  // load. The real sign-in flow (AuthDialog) sets these directly from its own response once OTP +
  // (for new accounts) the profile step finish; this fetch is just the fallback for "I already
  // have a valid session, who am I."
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body: { signedIn: boolean; role?: Role; displayName?: string | null; uid?: string; email?: string | null; photoURL?: string | null }) => {
        if (body.signedIn) {
          setRole(body.role ?? "user");
          setDisplayName(body.displayName ?? null);
          if (body.uid) setUser({ uid: body.uid, email: body.email ?? null, photoURL: body.photoURL ?? null });
        }
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, []);

  const value: AuthContextValue = {
    user,
    role,
    displayName,
    isAuthorized: role !== null,
    loading: !sessionChecked,
    setRole,
    setDisplayName,
    setUser,
    signOut: async () => {
      await fetch("/api/auth/session", { method: "DELETE" });
      await supabase.auth.signOut();
      setRole(null);
      setDisplayName(null);
      setUser(null);
      // The rest of the current route (everything below the header, which reacts to `role`
      // directly) is Server-Component-rendered from the session cookie at request time — without
      // this, signed-in-only content stays visible/stale until a hard reload clears it.
      router.refresh();
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
