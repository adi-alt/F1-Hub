export type MediaKind = "image" | "video" | "document";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const VIDEO_EXT = new Set(["mp4", "webm"]);

/** Classifies a media URL/filename by its extension alone - no separate "kind" column on
 * group_posts, since the upload route already names the object with its real extension (see
 * /api/posts/media/route.ts), and a GIF picked from GifPicker is always a plain .gif URL too.
 * Shared by the composer's own preview and PostMedia's render choice, so the two can never
 * disagree about what a given file is. */
export function mediaKind(url: string): MediaKind {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "document";
}

export function fileNameFromUrl(url: string): string {
  const path = url.split("?")[0];
  return decodeURIComponent(path.split("/").pop() ?? "file");
}
