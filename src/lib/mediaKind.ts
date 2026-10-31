export type MediaKind = "image" | "video" | "document";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const VIDEO_EXT = new Set(["mp4", "webm"]);

/** Extracts the extension from a URL or filename, properly decoding query params (e.g. ?path=...jpg). */
export function extractExtension(raw: string): string {
  if (!raw) return "";
  // Check if this is a served media URL: /api/posts/media/file?path=...
  if (raw.includes("?path=") || raw.includes("&path=")) {
    try {
      const match = raw.match(/[?&]path=([^&#]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        const ext = decoded.split(".").pop()?.toLowerCase();
        if (ext && ext !== decoded) return ext;
      }
    } catch {
      // fallback
    }
  }
  const clean = raw.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return ext;
}

/** Classifies a media URL/filename by its extension alone - no separate "kind" column on
 * group_posts, since the upload route already names the object with its real extension (see
 * /api/posts/media/route.ts), and a GIF picked from GifPicker is always a plain .gif URL too.
 * Shared by the composer's own preview and PostMedia's render choice, so the two can never
 * disagree about what a given file is. */
export function mediaKind(url: string): MediaKind {
  const ext = extractExtension(url);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "document";
}

export function fileNameFromUrl(url: string): string {
  if (!url) return "file";
  if (url.includes("?path=") || url.includes("&path=")) {
    try {
      const match = url.match(/[?&]path=([^&#]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        const name = decoded.split("/").pop();
        if (name) return name;
      }
    } catch {
      // fallback
    }
  }
  const path = url.split("?")[0].split("#")[0];
  return decodeURIComponent(path.split("/").pop() ?? "file");
}
