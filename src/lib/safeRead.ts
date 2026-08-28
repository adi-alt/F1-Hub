/** Calls a (typically `unstable_cache`-wrapped) database read and returns `fallback` instead of
 * throwing if it fails — a quota error, a transient outage, whatever. A page built from several
 * of these degrades gracefully (empty sections, still a real page) instead of crashing outright
 * the way an uncaught Server Component error does.
 *
 * Deliberately wraps the call *site*, not the cached function itself: `unstable_cache` never
 * caches a thrown error, so if this lived inside the cached function, the fallback would get
 * written into the cache as if it were real data — a transient outage would then serve an empty
 * page to everyone for the entire revalidate window, long after the database recovered. Wrapping
 * the call site instead means only a genuine successful read is ever cached; a failure just
 * degrades that one request, and the next request (or the next cache check) tries fresh again. */
export async function safeRead<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error("safeRead: read failed, serving fallback instead of crashing:", error);
    return fallback;
  }
}

/** Same degrade-to-fallback behavior as safeRead, but also reports whether the read actually
 * failed - safeRead alone makes a real outage indistinguishable from genuine "nothing here yet"
 * (both just render as an empty list), which is the wrong UI for the former: Archive's index page
 * wants to show "some historical data couldn't be loaded, try again" only on a real failure, not
 * on every legitimately-empty pipeline-hasn't-reached-it-yet case. */
export async function safeReadTracked<T>(read: () => Promise<T>, fallback: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await read(), failed: false };
  } catch (error) {
    console.error("safeReadTracked: read failed, serving fallback instead of crashing:", error);
    return { data: fallback, failed: true };
  }
}
