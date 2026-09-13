// Prevents a single favorite (or other own-profile) change from triggering more than one
// router.refresh() in quick succession — the same write is observed both by the component that
// made it (immediate, optimistic call site) and by AppRealtimeSync's realtime echo of that same
// row update arriving a moment later. Without this, one user action produces two refreshes and,
// downstream, two HomepageIntelligenceProvider refetches.
// ponytail: a module-scoped timestamp is enough — one browser tab's worth of calls to coordinate,
// not a cross-tab/cross-user problem. Upgrade to something smarter only if a real case needs it.
let lastRefreshAt = 0;
const REFRESH_DEBOUNCE_MS = 800;

export function refreshOnce(router: { refresh: () => void }) {
  const now = Date.now();
  if (now - lastRefreshAt < REFRESH_DEBOUNCE_MS) return;
  lastRefreshAt = now;
  router.refresh();
}
