"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  // The group-predictions wallet balance (lib/supabase/points.ts) - unlike role/displayName this
  // isn't session-cached (it changes on every prediction entry/payout, which the session cookie
  // never sees), so it's re-fetched, not just hydrated once - see refreshPointsBalance.
  pointsBalance: number | null;
  /** Whether this user has already been through (or dismissed) the product tour. `null` while the
   * session is still resolving - the tour waits for a real answer rather than flashing on and off
   * during hydration. */
  onboardingDone: boolean | null;
  setOnboardingDone: (done: boolean) => void;
  isAuthorized: boolean;
  loading: boolean;
  /** True until /api/auth/me has answered: the session itself is known from the first render (the root layout
   * reads it), but the points balance and the tour flag only come from that request. */
  detailsPending: boolean;
  setRole: (role: Role | null) => void;
  setDisplayName: (name: string | null) => void;
  setUser: (user: SessionUser | null) => void;
  refreshPointsBalance: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** The session as the server read it for this request (root layout): `null` for a signed-out visitor. */
export type InitialAuth = { uid: string; email: string | null; photoURL: string | null; role: Role; displayName: string | null } | null;

/** Tells the server this browser's time zone, so emails can give times in it ("Qualifying starts Sat 25 Oct, 23:00").
 * Once per zone per person: a move or a new device with a different zone sends it again. */
function rememberTimeZone(uid: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = `apex-tz:${uid}`;
  try {
    if (!tz || localStorage.getItem(key) === tz) return;
  } catch {
    return;
  }
  void fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeZone: tz }) })
    .then((res) => {
      if (!res.ok) return;
      try {
        localStorage.setItem(key, tz);
      } catch {
        // Storage blocked: it's sent again next time, which is harmless.
      }
    })
    .catch(() => {});
}

export function AuthProvider({ children, initialAuth }: { children: ReactNode; initialAuth?: InitialAuth }) {
  const router = useRouter();
  // Seeded from the server's own read of the session cookie, so the first render - the server's HTML included -
  // already knows whether this visitor is signed in: no placeholder in the header that then turns into
  // "Sign in / Sign up", no footer appearing late. Without a seed (undefined), it starts unknown and waits on
  // /api/auth/me as before.
  const [user, setUser] = useState<SessionUser | null>(initialAuth ? { uid: initialAuth.uid, email: initialAuth.email, photoURL: initialAuth.photoURL } : null);
  const [role, setRole] = useState<Role | null>(initialAuth?.role ?? null);
  const [displayName, setDisplayName] = useState<string | null>(initialAuth?.displayName ?? null);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [sessionChecked, setSessionChecked] = useState(initialAuth !== undefined);
  const [detailsChecked, setDetailsChecked] = useState(false);

  // Fills in what the session cookie doesn't carry (the points balance, the tour flag) and, without a seed, the
  // session itself. The real sign-in flow (AuthDialog) sets these directly from its own response once OTP +
  // (for new accounts) the profile step finish.
  type MeResponse = { signedIn: boolean; role?: Role; displayName?: string | null; uid?: string; email?: string | null; photoURL?: string | null; pointsBalance?: number | null; onboardingDone?: boolean };
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body: MeResponse) => {
        if (body.signedIn) {
          setRole(body.role ?? "user");
          setDisplayName(body.displayName ?? null);
          setPointsBalance(body.pointsBalance ?? null);
          if (body.uid) setUser({ uid: body.uid, email: body.email ?? null, photoURL: body.photoURL ?? null });
          setOnboardingDone(body.onboardingDone ?? true);
          if (body.uid) rememberTimeZone(body.uid);
        } else {
          // The session ended between the page render and this request: follow the server.
          setRole(null);
          setUser(null);
          setDisplayName(null);
          // A confirmed guest has no tour to run; resolving this to true keeps the tour from
          // waiting forever on an answer that will never come.
          setOnboardingDone(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        setSessionChecked(true);
        setDetailsChecked(true);
      });
  }, []);

  // Re-pulls just the balance - called by AppRealtimeSync whenever the signed-in user's own
  // `profiles` row changes (the same subscription that already drives Favorites' invalidation),
  // so a prediction payout on the Groups page shows up in the header without a full reload.
  const refreshPointsBalance = useCallback(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body: MeResponse) => {
        if (body.signedIn) setPointsBalance(body.pointsBalance ?? null);
      })
      .catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    await supabase.auth.signOut();
    setRole(null);
    setDisplayName(null);
    setUser(null);
    setPointsBalance(null);
    setOnboardingDone(true);
    // The rest of the current route (everything below the header, which reacts to `role`
    // directly) is Server-Component-rendered from the session cookie at request time — without
    // this, signed-in-only content stays visible/stale until a hard reload clears it.
    router.refresh();
  }, [router]);

  // Memoized: an unmemoized inline object here was confirmed (2026-09-10 perf audit) to cascade
  // into every consumer re-rendering on ANY unrelated state change here (e.g. refreshPointsBalance
  // firing from a real-time balance update elsewhere in the app) - including HomepageIntelligence-
  // Provider's whole subtree via HomeShell's useAuth() call, even though the AI intelligence data
  // itself never changed. State setters (setRole/setDisplayName/setUser) are already
  // referentially stable per React's own guarantee.
  const value: AuthContextValue = useMemo(
    () => ({
      user,
      role,
      displayName,
      pointsBalance,
      onboardingDone,
      setOnboardingDone,
      isAuthorized: role !== null,
      loading: !sessionChecked,
      detailsPending: !detailsChecked,
      setRole,
      setDisplayName,
      setUser,
      refreshPointsBalance,
      signOut,
    }),
    [user, role, displayName, pointsBalance, onboardingDone, sessionChecked, detailsChecked, refreshPointsBalance, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
