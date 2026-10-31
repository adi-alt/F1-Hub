import { test } from "node:test";
import assert from "node:assert/strict";
import { extractExtension, fileNameFromUrl, mediaKind } from "../mediaKind";

test("extractExtension correctly parses plain URLs, queries, and served media paths", () => {
  assert.equal(extractExtension("photo.jpg"), "jpg");
  assert.equal(extractExtension("https://example.com/photo.png?token=123"), "png");
  assert.equal(
    extractExtension("https://www.apexf1hub.com/api/posts/media/file?path=256082fb-b656-4c1c-8619-c7fefd52f0da%2F2f53a545-bd35-4483-a824-33f2148da61b.jpg"),
    "jpg",
  );
  assert.equal(extractExtension("/api/posts/media/file?path=userId%2Fclip.mp4"), "mp4");
  assert.equal(extractExtension("/api/posts/media/file?path=userId%2Fdoc.pdf"), "pdf");
});

test("mediaKind identifies images, videos, and documents accurately", () => {
  assert.equal(mediaKind("https://example.com/pic.jpeg"), "image");
  assert.equal(
    mediaKind("https://www.apexf1hub.com/api/posts/media/file?path=256082fb-b656-4c1c-8619-c7fefd52f0da%2F2f53a545-bd35-4483-a824-33f2148da61b.jpg"),
    "image",
  );
  assert.equal(mediaKind("/api/posts/media/file?path=userId%2Fclip.webm"), "video");
  assert.equal(mediaKind("/api/posts/media/file?path=userId%2Fdoc.pdf"), "document");
});

test("fileNameFromUrl extracts original file name from served path query", () => {
  assert.equal(fileNameFromUrl("https://example.com/archive.zip"), "archive.zip");
  assert.equal(
    fileNameFromUrl("https://www.apexf1hub.com/api/posts/media/file?path=256082fb-b656-4c1c-8619-c7fefd52f0da%2F2f53a545-bd35-4483-a824-33f2148da61b.jpg"),
    "2f53a545-bd35-4483-a824-33f2148da61b.jpg",
  );
});
