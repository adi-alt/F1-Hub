"use client";

import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { AuthDialog } from "./AuthDialog";

/** The one mounted instance of AuthDialog for the whole app, driven by the shared store —
 * SignInButton/SignInGate/anything else just call useAuthDialogStore.getState().open(). Mounted
 * only while open (not always-mounted with an `open` prop) so a fresh mount is fresh state, no
 * reset-on-open effect needed. */
export function AuthDialogHost() {
  const isOpen = useAuthDialogStore((s) => s.isOpen);
  const close = useAuthDialogStore((s) => s.close);
  if (!isOpen) return null;
  return <AuthDialog onClose={close} />;
}
