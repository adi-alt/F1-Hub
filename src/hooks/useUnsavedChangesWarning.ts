import { useEffect } from "react";

/** Warns before an actual tab close/refresh while `isDirty` is true - the one part of "warn on
 * unsaved changes" that's cheap and safe to add here: a real `beforeunload` listener, not an
 * attempt to intercept in-app Next.js Link/router navigation too (App Router has no equivalent of
 * the Pages Router's `routeChangeStart` to hook into, and no existing pattern for this exists
 * anywhere else in the app to extend - inventing one just for Manage's own sections would be new
 * cross-cutting architecture for a single surface, not a fix to something already there). Every
 * Manage section that tracks its own local draft against the saved `group` prop can pass its own
 * dirty check in independently. */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}
