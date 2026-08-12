"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase/client";
import type { Role } from "@/lib/rbac";

type AuthContextValue = {
  user: User | null;
  // Cached from the session for instant client-side nav/UI reactivity — see the same caveat on
  // SessionData.role in lib/session/config.ts. `null` here means "not signed in", not "no role".
  role: Role | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Bridges Firebase's client-only session into the server-readable iron-session cookie (see
// api/auth/session), so Server Components can know who's signed in without a client fetch.
// Returns the role from that same response so the header/nav can react to it immediately,
// instead of only ever seeing it after a full page reload.
async function syncServerSession(user: User | null): Promise<Role | null> {
  if (user) {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { role?: Role };
    return body.role ?? "user";
  }
  await fetch("/api/auth/session", { method: "DELETE" });
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      void syncServerSession(nextUser).then(setRole);
    });
  }, []);

  const value: AuthContextValue = {
    user,
    role,
    loading,
    signInWithGoogle: async () => {
      await signInWithPopup(auth, googleProvider);
    },
    signOut: () => firebaseSignOut(auth),
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
