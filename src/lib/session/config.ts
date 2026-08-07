import type { SessionOptions } from "iron-session";

export type SessionData = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
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
