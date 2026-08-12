import type { SessionOptions } from "iron-session";
import type { Role } from "@/lib/rbac";

export type SessionData = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  // Cached for instant client-side UI reactivity (nav links, dropdown) only — never trusted for
  // an actual permission decision. Every real check re-reads Firestore via getUserRole, so a
  // demotion takes effect immediately server-side even though this cached copy may lag until the
  // next sign-in. See src/lib/rbac.ts.
  role?: Role;
};

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET is not set — required for iron-session (see .env.local).");
}

export const sessionOptions: SessionOptions = {
  cookieName: "f1hub_session",
  password: secret,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};
