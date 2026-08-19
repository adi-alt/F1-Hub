import { NextResponse, after } from "next/server";
import { deliverOtp, prepareOtp } from "@/lib/otp";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Where Google/GitHub redirect back to after the user approves the OAuth prompt (see
 * signInWithOAuth's redirectTo in AuthDialog.tsx). Unlike the old Firebase popup flow, this is a
 * full-page round trip — there's no in-memory result to hand back to the component that opened
 * the dialog, so this route does the equivalent of afterProviderAuth() itself: exchange the
 * OAuth code for a session (sets Supabase's cookies), start the same custom OTP gate every sign-in
 * method goes through, then redirect home with a flag the dialog watches for (see
 * AuthDialogHost.tsx) to reopen itself on the OTP step. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${url.origin}/?authError=1`);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return NextResponse.redirect(`${url.origin}/?authError=1`);

  const email = data.user.email;
  const prepared = await prepareOtp(email);
  // "cooldown" here would be unusual (this is a fresh OAuth round trip, not a resend click) but
  // costs nothing to handle the same way /api/auth/start already does.
  if (prepared !== "cooldown") after(() => deliverOtp(email, prepared.code));

  return NextResponse.redirect(`${url.origin}/?authStep=otp`);
}
