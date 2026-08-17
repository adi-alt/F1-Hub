"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import type { Role } from "@/lib/rbac";

type AuthContextValue = {
  // Firebase's own client-side auth state — becomes truthy the instant signInWithPopup/
  // signInWithEmailAndPassword resolves, well before OTP runs. Never use this to decide whether
  // to show signed-in UI; that's what isAuthorized is for. This exists for the auth dialog itself
  // (it needs the Firebase user to get an ID token) and for display fields once isAuthorized is
  // true (by then Firebase auth has necessarily already succeeded too).
  user: User | null;
  // True only once a real server session exists — set the moment otp/verify or complete-signup
  // actually mints one (AuthDialog calls setRole directly), or hydrated from an existing session
  // on page load via /api/auth/me. A signed-in-to-Firebase-but-not-yet-OTP-verified user is
  // *not* authorized, on purpose: nothing sensitive should render for them until this flips true.
  role: Role | null;
  // The profile's own firstName (session-cached — see createSession.ts), not Firebase's
  // `user.displayName`: that's only ever set by an OAuth provider, so it's null for every
  // email/password account. This is the reliable "what do we call this person" source.
  displayName: string | null;
  isAuthorized: boolean;
  loading: boolean;
  setRole: (role: Role | null) => void;
  setDisplayName: (name: string | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [firebaseChecked, setFirebaseChecked] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setFirebaseChecked(true);
    });
  }, []);

  // Hydrates `role`/`displayName` from whatever server session already exists (a normal
  // persisted cookie) — deliberately not tied to Firebase's auth state, since re-checking on
  // every auth-state change would mean re-verifying on every tab focus/reload. The real sign-in
  // flow (AuthDialog) sets these directly from its own response once OTP + (for new accounts)
  // the profile step finish; this fetch is just the fallback for "I already have a valid
  // session, who am I."
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body: { signedIn: boolean; role?: Role; displayName?: string | null }) => {
        if (body.signedIn) {
          setRole(body.role ?? "user");
          setDisplayName(body.displayName ?? null);
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
    // Waits on both checks, not just Firebase's — a returning user whose Firebase auth resolves
    // first would otherwise flash signed-out UI for a moment before /api/auth/me catches up.
    loading: !firebaseChecked || !sessionChecked,
    setRole,
    setDisplayName,
    signOut: async () => {
      await fetch("/api/auth/session", { method: "DELETE" });
      await firebaseSignOut(auth);
      setRole(null);
      setDisplayName(null);
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
