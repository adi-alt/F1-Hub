/**
 * A non-essential section's data, failing soft: if the load throws (a pending migration, a timeout), log it and
 * resolve to `fallback`, so the page renders without that section instead of going to the error boundary.
 * Only for sections the page reads fine without; the page's own data should still throw.
 */
export async function softFail<T>(label: string, load: Promise<T>, fallback: T): Promise<T> {
  try {
    return await load;
  } catch (error) {
    console.error(`[softFail] ${label}:`, error);
    return fallback;
  }
}
