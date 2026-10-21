"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { AuthDialog } from "./AuthDialog";

/** Watches for the flags /auth/callback redirects back with (see that route) — `authStep=otp`
 * reopens the dialog straight onto the OTP step after an OAuth round trip, `authError=1` just
 * clears itself since AuthDialog's own "method" step is a fine enough fallback. Needs
 * useSearchParams, hence the Suspense boundary — this runs on every page, not just ones that
 * already have one. */
function OAuthResumeWatcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openAtOtp = useAuthDialogStore((s) => s.openAtOtp);

  useEffect(() => {
    const otp = searchParams.get("authStep") === "otp";
    if (!otp && searchParams.get("authError") !== "1") return;
    if (otp) openAtOtp();
    // Only the flag goes: the page the round trip started on (an invitation, say) stays.
    const url = new URL(window.location.href);
    url.searchParams.delete("authStep");
    url.searchParams.delete("authError");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [searchParams, openAtOtp, router]);

  return null;
}

/** The one mounted instance of AuthDialog for the whole app, driven by the shared store —
 * SignInButton/SignInGate/anything else just call useAuthDialogStore.getState().open(). Mounted
 * only while open (not always-mounted with an `open` prop) so a fresh mount is fresh state, no
 * reset-on-open effect needed. */
export function AuthDialogHost() {
  const isOpen = useAuthDialogStore((s) => s.isOpen);
  const resumeAtOtp = useAuthDialogStore((s) => s.resumeAtOtp);
  const close = useAuthDialogStore((s) => s.close);

  return (
    <>
      <Suspense fallback={null}>
        <OAuthResumeWatcher />
      </Suspense>
      {isOpen && <AuthDialog onClose={close} resumeAtOtp={resumeAtOtp} />}
    </>
  );
}
