import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** The time zone to format times in: "UTC" on the server and while hydrating, then `undefined` (the
 * viewer's own zone) once the page is live in the browser.
 *
 * Why not just format with `toLocaleString` and `suppressHydrationWarning`: the server renders in UTC, and
 * React deliberately does NOT patch a text mismatch that warning is suppressed for. A viewer in India
 * kept the server's "7:00 AM UTC" on screen after the page loaded - the times never followed the viewer.
 * A snapshot that differs between server and client is the supported way to change on hydration: React
 * re-renders with the client value instead of keeping the server's. */
export function useViewerTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => undefined,
    () => "UTC",
  );
}
