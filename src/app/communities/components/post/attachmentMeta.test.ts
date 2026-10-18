import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentBadge, attachmentKind, attachmentMetaLine, displayName, formatBytes } from "./attachmentMeta";

// The bug this whole metadata chain exists to fix: a post used to show the Storage object's
// filename, which is a random UUID. Nothing here may ever produce one - not as a name, and not
// as a badge derived from a name it doesn't have.
test("a storage UUID never becomes a display name", () => {
  const uuid = "8f1c2b7a-4d3e-4f1a-9c22-6b0e5a1d77ff";
  assert.equal(displayName(null, "pdf"), "PDF document");
  assert.equal(displayName("", "pdf"), "PDF document");
  assert.equal(displayName("   ", "file"), "Attachment");
  assert.notEqual(displayName(null, "pdf"), uuid);
  // A badge for an unnamed file comes from its kind, never from a path fragment.
  assert.equal(attachmentBadge("pdf", null), "PDF");
  assert.equal(attachmentBadge("sheet", null), "SHEET");
});

test("the original name is shown exactly, trimmed, however long", () => {
  assert.equal(displayName("Adobe Scan 17 Sep 2026_digitized.pdf", "pdf"), "Adobe Scan 17 Sep 2026_digitized.pdf");
  assert.equal(displayName("  spaced.docx  ", "doc"), "spaced.docx");
});

test("kind comes from the mime the server validated, with the extension only as fallback", () => {
  assert.equal(attachmentKind("application/pdf", "whatever.txt"), "pdf");
  assert.equal(attachmentKind("image/avif", null), "image");
  assert.equal(attachmentKind("video/quicktime", null), "video");
  assert.equal(attachmentKind("audio/mpeg", null), "audio");
  // No mime (a pre-metadata row, or the GIF picker): fall back to the extension.
  assert.equal(attachmentKind(null, "report.xlsx"), "sheet");
  assert.equal(attachmentKind(null, "https://example.com/a/b.png?token=x"), "image");
  // Unknown stays "file" rather than being guessed into the wrong renderer.
  assert.equal(attachmentKind(null, "archive.bin"), "file");
  assert.equal(attachmentKind(null, null), "file");
});

test("the badge prefers the real extension but refuses a long one", () => {
  assert.equal(attachmentBadge("sheet", "q3.xlsx"), "XLSX");
  assert.equal(attachmentBadge("doc", "notes.markdown"), "DOC");
});

test("the meta line drops what isn't known instead of inventing it", () => {
  assert.equal(attachmentMetaLine({ pages: 2, size: 1_363_148, badge: "PDF" }), "2 pages · 1.3 MB · PDF");
  assert.equal(attachmentMetaLine({ pages: 1, size: null, badge: "PDF" }), "1 page · PDF");
  assert.equal(attachmentMetaLine({ pages: null, size: null, badge: "ZIP" }), "ZIP");
});

test("sizes read in the unit a person would use", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1_572_864), "1.5 MB");
  assert.equal(formatBytes(null), null);
  assert.equal(formatBytes(-1), null);
});
