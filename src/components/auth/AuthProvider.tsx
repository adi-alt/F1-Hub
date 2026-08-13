"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import type { Role } from "@/lib/rbac";

type AuthContextValue = {
  user: User | null;
  // Cached from /api/auth/me (an existing-session read, not a fresh sign-in) for instant
  // client-side nav/UI reactivity — see the same caveat on SessionData.role in
  // lib/session/config.ts. `null` here means "not signed in", not "no role".
  role: Role | null;
  loading: boolean;
  // AuthDialog calls this directly once its own flow actually finishes (OTP verified, session
  // minted server-side) — nothing else should set this.
  setRole: (role: Role | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  // Hydrates `role` from whatever server session already exists (a normal persisted cookie) —
  // deliberately not tied to Firebase's auth state, since re-checking on every auth-state change
  // would mean re-verifying on every tab focus/reload. The real sign-in flow (AuthDialog) sets
  // this directly from its own response once OTP + (for new accounts) the profile step finish;
  // this fetch is just the fallback for "I already have a valid session, what's my role."
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body: { signedIn: boolean; role?: Role }) => {
        if (body.signedIn) setRole(body.role ?? "user");
      })
      .catch(() => {});
  }, []);

  const value: AuthContextValue = {
    user,
    role,
    loading,
    setRole,
    signOut: async () => {
      await fetch("/api/auth/session", { method: "DELETE" });
      await firebaseSignOut(auth);
      setRole(null);
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
