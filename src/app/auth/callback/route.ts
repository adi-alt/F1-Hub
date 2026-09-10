import { NextResponse, after } from "next/server";
import { deliverOtp, prepareOtp } from "@/lib/otp";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Where Google/GitHub redirect back to after the user approves the OAuth prompt (see
 * signInWithOAuth's redirectTo in AuthDialog.tsx). Unlike the old Firebase popup flow, this is a
 * full-page round trip — there's no in-memory result to hand back to the component that opened
 * the dialog, so this route does the equivalent of afterProviderAuth() itself: exchange the
 * OAuth code for a session (sets Supabase's cookies), start the same custom OTP gate every sign-in
 * method goes through, then redirect onward.
 *
 * Two landing spots depending on how this round trip started (see the `popup` param, set by
 * AuthDialog when it opened the provider in a popup rather than navigating the main tab):
 * - popup=1: redirect to /auth/popup-closed, which posts the result back to the tab that opened
 *   it (via postMessage) and closes itself - the main tab never reloads at all.
 * - otherwise: redirect home with a flag AuthDialogHost.tsx watches for, to reopen the dialog on
 *   the OTP step - the same-tab fallback for when the popup was blocked. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const isPopup = url.searchParams.get("popup") === "1";

  function landing(step: "otp" | "error", email?: string) {
    if (isPopup) {
      const dest = new URL(`${url.origin}/auth/popup-closed`);
      dest.searchParams.set("step", step);
      if (email) dest.searchParams.set("email", email);
      return NextResponse.redirect(dest);
    }
    return NextResponse.redirect(step === "otp" ? `${url.origin}/?authStep=otp` : `${url.origin}/?authError=1`);
  }

  if (!code) return landing("error");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return landing("error");

  const email = data.user.email;
  const prepared = await prepareOtp(email);
  // "cooldown" here would be unusual (this is a fresh OAuth round trip, not a resend click) but
  // costs nothing to handle the same way /api/auth/start already does.
  if (prepared !== "cooldown") after(() => deliverOtp(email, prepared.code));

  return landing("otp", email);
}
