export type GifResult = { id: string; url: string; previewUrl: string; alt: string };

/** One rendition Klipy returns for a clip, in one format and size. */
type KlipyFile = { url?: string; width?: number; height?: number; size?: number };
type KlipyRenditions = Partial<Record<"gif" | "webp" | "jpg" | "mp4" | "webm", KlipyFile>>;
type KlipyItem = {
  id?: number | string;
  title?: string;
  slug?: string;
  /** Four size buckets, each carrying every format. Any of them can be missing for a given clip,
   * which is why every read below is optional and falls through rather than indexing blindly. */
  file?: Partial<Record<"hd" | "md" | "sm" | "xs", KlipyRenditions>>;
};
type KlipyResponse = { result?: boolean; data?: { data?: KlipyItem[] }; errors?: { message?: string[] } };

const BASE = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;
const TIMEOUT_MS = 6000;

/** Whether a real provider is wired up. The API route reports this so the picker can say "not
 * configured" rather than showing an empty grid that looks like a failed search. */
export function gifProviderConfigured(): boolean {
  return !!process.env.KLIPY_API_KEY;
}

/** Biggest-to-smallest for the posted GIF, smallest-up for the grid thumbnail. `md` rather than
 * `hd` for the post itself: hd runs to ~1.7MB for a five-second clip, and md is the same 640x360
 * at a fraction of it. */
function pickUrl(item: KlipyItem, order: ("hd" | "md" | "sm" | "xs")[]): string | null {
  for (const size of order) {
    const url = item.file?.[size]?.gif?.url;
    if (url) return url;
  }
  return null;
}

/**
 * GIF search, backed by Klipy.
 *
 * An empty query is a real request, not a no-op: Klipy's search returns trending clips for one, so
 * opening the picker shows something immediately instead of an empty grid waiting on typing.
 *
 * The key lives only in `KLIPY_API_KEY` and only on the server - it is interpolated into the path
 * here, inside a route handler, and never reaches the browser. The picker talks to our own
 * /api/gifs/search, which is session-gated, so the key can't be lifted out of a client bundle or
 * used as an open proxy.
 *
 * Any failure (no key, network, non-200, malformed body) returns an empty list rather than throwing:
 * a composer must stay usable when a third-party GIF service is down.
 */
export async function searchGifs(query: string): Promise<GifResult[]> {
  const key = process.env.KLIPY_API_KEY;
  if (!key) return [];

  const url = `${BASE}/${encodeURIComponent(key)}/gifs/search?q=${encodeURIComponent(query.trim())}&per_page=${PER_PAGE}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as KlipyResponse;
    if (!body.result || !Array.isArray(body.data?.data)) return [];

    return body.data.data
      .map((item): GifResult | null => {
        const full = pickUrl(item, ["md", "hd", "sm", "xs"]);
        const preview = pickUrl(item, ["sm", "xs", "md", "hd"]);
        if (!full || !preview || item.id === undefined) return null;
        return { id: String(item.id), url: full, previewUrl: preview, alt: item.title?.trim() || "GIF" };
      })
      .filter((g): g is GifResult => g !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
