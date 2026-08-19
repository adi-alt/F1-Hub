import { createClient } from "@supabase/supabase-js";

function loadUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.local).");
  return url;
}

function loadServiceKey() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set — required for server-side Postgres access (see .env.local).");
  return key;
}

// Service-role client: bypasses RLS entirely, same trust level as firebase-admin's adminDb. Every
// real data read/write goes through this, never through a user's own cookie-bound session client
// — same "client never talks to the DB directly" model this app already had (see the comment atop
// lib/firestore/users.ts), just backed by Postgres instead of Firestore now.
export const supabaseAdmin = createClient(loadUrl(), loadServiceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});
