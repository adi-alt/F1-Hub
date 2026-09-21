/** Everything the attachment UI needs to know about a file, derived once so the composer preview
 * and the feed card can never disagree about what a file is. */
export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "sheet" | "doc" | "slides" | "text" | "code" | "archive" | "file";

const BY_MIME: Record<string, AttachmentKind> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "text/csv": "sheet",
  "application/vnd.ms-powerpoint": "slides",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "slides",
  "text/plain": "text",
  "text/markdown": "text",
  "application/json": "code",
  "application/zip": "archive",
};

const BY_EXT: Record<string, AttachmentKind> = {
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  xls: "sheet",
  xlsx: "sheet",
  csv: "sheet",
  ppt: "slides",
  pptx: "slides",
  txt: "text",
  md: "text",
  json: "code",
  zip: "archive",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
};

/** MIME first (it's what the server validated), extension as the fallback for rows that predate
 * metadata. Never guesses beyond those two - an unknown type is "file", which renders fine. */
export function attachmentKind(mime: string | null, nameOrUrl: string | null): AttachmentKind {
  if (mime) {
    if (BY_MIME[mime]) return BY_MIME[mime];
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("text/")) return "text";
  }
  const ext = nameOrUrl?.split("?")[0].split(".").pop()?.toLowerCase();
  return (ext && BY_EXT[ext]) || "file";
}

/** The short badge shown against the file - its real extension where there is one, otherwise a
 * label for its kind. Never "application/vnd.openxmlformats-…". */
export function attachmentBadge(kind: AttachmentKind, name: string | null): string {
  const ext = name?.includes(".") ? name.split(".").pop()?.toUpperCase() : null;
  if (ext && ext.length <= 4) return ext;
  return { image: "IMG", video: "VIDEO", audio: "AUDIO", pdf: "PDF", sheet: "SHEET", doc: "DOC", slides: "SLIDES", text: "TXT", code: "CODE", archive: "ZIP", file: "FILE" }[kind];
}

export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2 pages · 1.3 MB · PDF", dropping whatever genuinely isn't known rather than inventing it. */
export function attachmentMetaLine(args: { pages: number | null; size: number | null; badge: string }): string {
  return [args.pages ? `${args.pages} ${args.pages === 1 ? "page" : "pages"}` : null, formatBytes(args.size), args.badge].filter(Boolean).join(" · ");
}

/** Last resort for a display name. Deliberately NOT the storage path: that is a random UUID, and
 * showing it is the bug this whole metadata chain exists to fix. */
export function displayName(name: string | null, kind: AttachmentKind): string {
  if (name && name.trim()) return name.trim();
  return { image: "Image", video: "Video", audio: "Audio clip", pdf: "PDF document", sheet: "Spreadsheet", doc: "Document", slides: "Presentation", text: "Text file", code: "Data file", archive: "Archive", file: "Attachment" }[kind];
}
