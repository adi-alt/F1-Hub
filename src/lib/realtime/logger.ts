/** No dedicated logging/monitoring service exists in this repo (see src/app/error.tsx's own
 * comment) — `console.error` is the established, already-visible-in-Vercel's-function-logs
 * convention here, so this doesn't invent a second one. Lifecycle noise (subscribe, status
 * change, resync) is dev-only; failures are logged in every environment, but only on an actual
 * failure/reconnect, never on every routine event — a healthy app shouldn't spam production logs
 * just because realtime is working. */
const isDev = process.env.NODE_ENV === "development";

export const realtimeLog = {
  debug(...args: unknown[]) {
    if (isDev) console.debug("[realtime]", ...args);
  },
  error(...args: unknown[]) {
    console.error("[realtime]", ...args);
  },
};
