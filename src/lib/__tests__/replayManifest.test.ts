// The replay manifest (src/data/replays.json) against the files it points to in public/replays/: every entry must
// be a file that exists, is exactly what the manifest says (size, SHA-256), carries that hash in its name, and
// decodes. A wrong or stale entry would show a Play button that can only fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import manifest from "../../data/replays.json";
import { decodeReplay, REPLAY_VERSION } from "../raceReplay";
import { isPlayableEntry, replayFor } from "../replayManifest";

const PUBLIC = join(__dirname, "..", "..", "..", "public");

test("every manifest entry is a real, exact, decodable, content-hashed file", () => {
  const entries = Object.entries(manifest as Record<string, unknown>);
  assert.ok(entries.length > 0, "the manifest has at least one replay");
  for (const [key, entry] of entries) {
    assert.ok(/^\d{4}-\d{1,2}$/.test(key), `key ${key} is season-round`);
    assert.ok(isPlayableEntry(entry), `${key}: a playable entry`);
    const path = join(PUBLIC, entry.file);
    assert.ok(existsSync(path), `${key}: ${entry.file} exists`);
    const bytes = readFileSync(path);
    assert.equal(bytes.length, entry.bytes, `${key}: size`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, `${key}: content hash`);
    assert.ok(entry.file.startsWith(`/replays/${key}.${entry.sha256.slice(0, 8)}.`), `${key}: the name carries its key and hash`);
    const r = decodeReplay(gunzipSync(bytes).buffer as ArrayBuffer);
    assert.equal(r.header.version, REPLAY_VERSION);
    assert.ok(r.header.cars.length > 0 && r.header.samples > 0, `${key}: has cars and samples`);
  }
});

test("replayFor: an entry only for a race that has one, in a format this build plays", () => {
  const [key, entry] = Object.entries(manifest)[0];
  const [y, r] = key.split("-").map(Number);
  assert.deepEqual(replayFor(y, r), entry);
  assert.equal(replayFor(1950, 1), null, "no entry: no replay");
  const sha = "a".repeat(64);
  const good = { file: `/replays/2026-1.${sha.slice(0, 8)}.bin`, bytes: 10, sha256: sha, version: REPLAY_VERSION };
  assert.ok(replayFor(2026, 1, { "2026-1": good }));
  assert.equal(replayFor(2026, 1, { "2026-1": { ...good, version: REPLAY_VERSION + 1 } }), null, "a newer format: hidden");
  assert.equal(replayFor(2026, 1, { "2026-1": { ...good, sha256: "b".repeat(64) } }), null, "a name that doesn't carry its hash");
  assert.equal(replayFor(2026, 1, { "2026-1": { ...good, file: "https://elsewhere.example/x.bin" } }), null, "only /replays/ files");
  assert.equal(replayFor(2026, 1, { "2026-1": "nonsense" }), null);
});
