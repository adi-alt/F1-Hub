export type GifResult = { id: string; url: string; previewUrl: string; alt: string };

/**
 * No GIF provider is configured yet - this app has no Giphy/Tenor integration today, and adding
 * one needs a real API key from that provider, not something to fabricate or hardcode a handful
 * of sample GIFs to fake. This function is the one clean seam GifPicker.tsx (and its API route)
 * call through, so wiring in a real provider later is a change to this file alone, nothing that
 * touches the UI.
 *
 * To wire in Tenor (recommended - generous free tier, no attribution requirement):
 *   1. Get a key: https://developers.google.com/tenor/guides/quickstart
 *   2. Set TENOR_API_KEY in .env.local and in Vercel's project env vars
 *   3. Replace this function's body with a fetch to
 *      https://tenor.googleapis.com/v2/search?q=<query>&key=<key>&limit=24&media_filter=tinygif
 *   4. Map each result's media_formats.tinygif.url (preview) and media_formats.gif.url (full) into
 *      GifResult - id from the result's own `id` field.
 *
 * Until then this returns empty (not fake placeholder GIFs) - the API route below turns an empty
 * result explicitly into "not configured" rather than a silent "no results found".
 */
export async function searchGifs(query: string): Promise<GifResult[]> {
  if (!process.env.TENOR_API_KEY || !query.trim()) return [];
  return [];
}
