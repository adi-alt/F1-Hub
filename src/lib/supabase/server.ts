import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Per-request client bound to this request's cookies — used only to answer "who is currently
 * signed in" (getSupabaseUser below), the same job adminAuth.verifyIdToken used to do. Never used
 * for actual data reads/writes; those go through supabaseAdmin (src/lib/supabase/admin.ts), same
 * split as today's Firebase client SDK (identity only) vs firebase-admin (everything else). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Route Handlers can write cookies; Server Components can't (mirrors getSession() in
      // lib/session/getSession.ts) — swallow that case rather than crash a page render over it.
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // called from a Server Component — fine, nothing here needs to persist a refreshed token.
        }
      },
    },
  });
}

/** Resolves the signed-in Supabase user for this request, or null. Every auth route that used to
 * call adminAuth.verifyIdToken(idToken) now calls this instead — the session lives in cookies
 * (set by the browser client or /auth/callback), so there's no token for the client to pass. */
export async function getSupabaseUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
