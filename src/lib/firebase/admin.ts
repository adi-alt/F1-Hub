import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set — required for any server-side Firestore write (see .env.local).",
    );
  }
  return JSON.parse(raw);
}

const app = getApps()[0] ?? initializeApp({ credential: cert(loadServiceAccount()) });

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
// RaceDoc has several optional fields (inputs, prediction, poleSitter, ...) that are legitimately
// `undefined` for some races (e.g. a season's first race before it's run) — Firestore rejects
// `undefined` values by default, so drop them instead of hand-stripping keys at every call site.
// settings() can only be called once per instance; a hot-reloaded dev server can re-run this
// module against an already-configured instance, so tolerate that specific error.
try {
  adminDb.settings({ ignoreUndefinedProperties: true });
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("already been initialized")) throw error;
}
