"use client";

import { createBrowserClient } from "@supabase/ssr";

// Session is stored in cookies (not localStorage/IndexedDB like the default @supabase/supabase-js
// client) specifically so the Next.js server side (route handlers, /auth/callback) can read the
// same session straight off the request — no idToken-style manual passing needed, unlike the old
// Firebase setup this replaces.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
