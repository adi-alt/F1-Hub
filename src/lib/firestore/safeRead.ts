/** Calls a (typically `unstable_cache`-wrapped) Firestore read and returns `fallback` instead of
 * throwing if it fails — e.g. Firestore's own `RESOURCE_EXHAUSTED` quota error, or any other
 * transient outage. A page built from several of these degrades gracefully (empty sections,
 * still a real page) instead of crashing outright the way an uncaught Server Component error
 * does.
 *
 * Deliberately wraps the call *site*, not the cached function itself: `unstable_cache` never
 * caches a thrown error, so if this lived inside the cached function, the fallback would get
 * written into the cache as if it were real data — a transient outage would then serve an empty
 * archive to everyone for the entire revalidate window, long after Firestore recovered. Wrapping
 * the call site instead means only a genuine successful read is ever cached; a failure just
 * degrades that one request, and the next request (or the next cache check) tries Firestore
 * fresh again. */
export async function safeRead<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error("safeRead: Firestore read failed, serving fallback instead of crashing:", error);
    return fallback;
  }
}
