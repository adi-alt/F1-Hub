"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** The landing spot for the popup-based OAuth round trip (see /auth/callback's own `popup=1`
 * branch and AuthDialog's handleProvider) - posts the real result (step + email, both already
 * resolved server-side in /auth/callback) back to the tab that opened this popup, then closes
 * itself. The opener does the rest (moves the dialog to the OTP step) - this page's only job is
 * to hand the result across and disappear; the main tab never reloads. `window.close()` works
 * here because this tab was opened by `window.open()` from our own script, not typed/clicked into
 * directly - browsers only allow script-closing tabs they themselves opened. The visible text
 * below is just the fallback for the rare case a browser blocks that. */
function PopupClosedInner() {
  const params = useSearchParams();

  useEffect(() => {
    const step = params.get("step");
    const email = params.get("email");
    window.opener?.postMessage({ source: "f1hub-oauth", step, email }, window.location.origin);
    window.close();
  }, [params]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#888" }}>
      <p>You can close this window.</p>
    </div>
  );
}

export default function PopupClosedPage() {
  return (
    <Suspense fallback={null}>
      <PopupClosedInner />
    </Suspense>
  );
}
