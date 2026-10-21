// Post attachments may only be the app's own uploads or Klipy GIFs (audit SEC-17): createPost
// refuses anything else, and every read drops it, so a row stored before the check can't render one.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, newId, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

const UPLOAD = "https://proj.supabase.co/storage/v1/object/public/post-media/user-1/photo.png";
const GIF = "https://static.klipy.com/ii/0b/5f/md.gif";
const SERVED = "/api/posts/media/file?path=user-1%2Fphoto.png";

let media: typeof import("../mediaUrls");
let posts: typeof import("../supabase/groupPosts");
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  media = await import("../mediaUrls");
  posts = await import("../supabase/groupPosts");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
});

beforeEach(() => {
  fake = new FakeSupabase();
  fake.defaults.group_posts = () => ({ id: newId(), created_at: "2026-10-01T00:00:00Z" });
});

const isBadRequest = (err: unknown) => (err as { httpStatus?: number }).httpStatus === 400;

describe("isAllowedMediaUrl", () => {
  test("accepts the app's own uploads and Klipy GIFs", () => {
    assert.equal(media.isAllowedMediaUrl(UPLOAD), true);
    assert.equal(media.isAllowedMediaUrl(GIF), true);
  });

  test("refuses every other source and scheme", () => {
    const refused: unknown[] = [
      "https://evil.example/pixel.png",
      "http://proj.supabase.co/storage/v1/object/public/post-media/user-1/photo.png", // not https
      "https://proj.supabase.co/storage/v1/object/public/avatars/user-1.png", // another bucket
      "https://proj.supabase.co/storage/v1/object/public/post-media/../avatars/user-1.png",
      "https://proj.supabase.co/storage/v1/object/public/post-media/%2e%2e/avatars/user-1.png",
      "https://other.supabase.co/storage/v1/object/public/post-media/user-1/photo.png", // another project
      "https://static.klipy.com.evil.example/x.gif",
      "https://user:pass@static.klipy.com/x.gif",
      "data:image/png;base64,iVBORw0KGgo=",
      "javascript:alert(1)",
      "not a url",
      `${GIF}?pad=${"a".repeat(3000)}`,
      42,
      null,
    ];
    for (const url of refused) assert.equal(media.isAllowedMediaUrl(url), false, String(url).slice(0, 90));
  });
});

describe("createPost", () => {
  test("stores an upload or a GIF", async () => {
    await posts.createPost(null, "user-1", { content: "photo", mediaUrl: UPLOAD });
    await posts.createPost(null, "user-1", { content: "gif", mediaUrl: GIF });
    assert.deepEqual(
      fake.rows("group_posts").map((r) => r.media_url),
      [UPLOAD, GIF],
    );
  });

  test("refuses any other attachment or thumbnail, and stores nothing", async () => {
    await assert.rejects(posts.createPost(null, "user-1", { content: "x", mediaUrl: "https://evil.example/p.png" }), isBadRequest);
    await assert.rejects(
      posts.createPost(null, "user-1", {
        content: "x",
        mediaUrl: UPLOAD,
        attachment: { name: "doc.pdf", mime: "application/pdf", size: 10, thumbUrl: "data:image/png;base64,AAAA", pages: 1 },
      }),
      isBadRequest,
    );
    assert.equal(fake.rows("group_posts").length, 0);
  });

  test("an empty string is no attachment, not a bad one", async () => {
    await posts.createPost(null, "user-1", { content: "plain", mediaUrl: "" });
    assert.equal(fake.rows("group_posts")[0].media_url, null);
  });
});

describe("reading posts", () => {
  const stored = (id: string, over: Row): Row => ({
    id, group_id: null, user_id: "user-1", title: null, content: id, status: "published", kind: "discussion", created_at: "2026-09-01T00:00:00Z", media_thumb_url: null, ...over,
  });

  test("a stored URL that isn't allowed is dropped; an allowed one is kept", async () => {
    fake.seed("group_posts", stored("p-bad", { media_url: "https://evil.example/pixel.png" }), stored("p-ok", { media_url: UPLOAD, media_thumb_url: "https://evil.example/t.png" }));

    const bad = await posts.getPostById("p-bad", "user-2");
    assert.equal(bad?.mediaUrl, null);
    assert.equal(bad?.attachment, null);

    const ok = await posts.getPostById("p-ok", "user-2");
    assert.equal(ok?.mediaUrl, SERVED, "an upload is shown through the checked route, never the bucket's address");
    assert.equal(ok?.attachment?.url, SERVED);
    assert.equal(ok?.attachment?.thumbUrl, null, "a bad thumbnail is dropped on its own");
  });
});

describe("served and stored addresses", () => {
  test("an upload round-trips: shown served, stored as the bucket's URL; a GIF is untouched", () => {
    assert.equal(media.servedMediaUrl(UPLOAD), SERVED);
    assert.equal(media.storedMediaUrl(SERVED), UPLOAD);
    assert.equal(media.servedMediaUrl(GIF), GIF);
    assert.equal(media.storedMediaUrl(GIF), GIF);
  });

  test("a served URL that isn't a plain upload path is left as is, so the write check refuses it", () => {
    for (const bad of ["/api/posts/media/file?path=..%2F..%2Fsecret", "/api/posts/media/file?path=a%2Fb%2Fc.png", "/api/posts/media/file?path="]) {
      assert.equal(media.storedMediaUrl(bad), bad);
      assert.equal(media.isAllowedMediaUrl(media.storedMediaUrl(bad)), false);
    }
  });

  test("a post written with the served URL the composer was shown stores the bucket's URL", async () => {
    await posts.createPost(null, "user-1", { content: "photo", mediaUrl: SERVED });
    assert.equal(fake.rows("group_posts")[0].media_url, UPLOAD);
  });
});
