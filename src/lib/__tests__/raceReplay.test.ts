// The replay decoder and the moment-by-moment reads the player makes. Synthetic replays built here in the same
// byte layout pipeline/race_replay.py writes (its own tests check the writer); a real race was checked in the
// browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeReplay, distanceAt, lapAt, standingsAt, statusAt, type ReplayHeader } from "../raceReplay";

function build(cars: Record<string, number[]>, extra: Partial<ReplayHeader> = {}): ArrayBuffer {
  const codes = Object.keys(cars);
  const chunks = codes.map((code) => {
    const v = cars[code];
    const bytes: number[] = [];
    const push16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
    push16(v[0]);
    for (let i = 1; i < v.length; i++) {
      const step = v[i] - v[i - 1];
      if (step >= -127 && step <= 127) bytes.push(step & 0xff);
      else {
        bytes.push(0x80); // -128: escape
        push16(step);
      }
    }
    return Uint8Array.from(bytes);
  });
  const header = {
    version: 1, hz: 2, startUtc: 0, samples: cars[codes[0]].length, lapLengthM: 1000, totalLaps: 3,
    cars: codes.map((code, i) => ({ code, number: String(i + 1), team: null, color: null, name: null })),
    stepBytes: chunks.map((c) => c.length), pits: [], retired: {}, trackStatus: [], outline: [], corners: [], rotation: null,
    startFinish: { x: 0, y: 0, verified: true }, ...extra,
  };
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + h.length + chunks.reduce((n, c) => n + c.length, 0));
  new DataView(out.buffer).setUint32(0, h.length, true);
  out.set(h, 4);
  let pos = 4 + h.length;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out.buffer;
}

test("decodes distances exactly, including a pit-lane jump written with the escape", () => {
  const { distances } = decodeReplay(build({ AAA: [-20, 10, 40, 340, 330, 360], BBB: [0, 30, 60, 90, 120, 150] }));
  assert.deepEqual([...distances.AAA], [-20, 10, 40, 340, 330, 360], "a 300 m jump and a step back both survive");
  assert.deepEqual([...distances.BBB], [0, 30, 60, 90, 120, 150]);
});

test("refuses a file that doesn't add up, rather than drawing cars in the wrong place", () => {
  const good = new Uint8Array(build({ AAA: [0, 10, 20] }));
  assert.throws(() => decodeReplay(good.slice(0, good.length - 1).buffer), /samples|truncated/);
  const text = new TextDecoder().decode(good);
  const wrongVersion = new TextEncoder().encode(text.replace('"version":1', '"version":9'));
  assert.throws(() => decodeReplay(wrongVersion.buffer), /version 9/);
});

test("interpolates between samples", () => {
  const d = Float32Array.from([0, 10, 30]);
  assert.equal(distanceAt(d, 0.5), 5);
  assert.equal(distanceAt(d, 1.25), 15);
  assert.equal(distanceAt(d, 99), 30, "held at the end");
});

test("standings: furthest first, retired last, a car in the pits holds its place, a pit-lane start is behind the grid", () => {
  const r = decodeReplay(
    build(
      { LEC: [100, 140, 180, 220], ALO: [400, 410, 420, 600], HAM: [90, 120, 150, 180], ALB: [80, 110, 110, 110] },
      { pits: [["ALO", 0, 2]], retired: { ALB: 2 } },
    ),
  );
  assert.deepEqual(standingsAt(r, 0).map((s) => s.code), ["LEC", "HAM", "ALB", "ALO"], "the pit-lane starter is last at lights out, not first");
  const at2 = standingsAt(r, 2);
  assert.deepEqual(at2.map((s) => s.code), ["LEC", "HAM", "ALO", "ALB"], "the retired car drops to the end");
  assert.ok(at2.find((s) => s.code === "ALB")?.retired && at2.find((s) => s.code === "ALO")?.pit);
  assert.equal(standingsAt(r, 3)[0].code, "ALO", "out of the pits, on track and ahead");
});

test("lap counter and track status", () => {
  const r = decodeReplay(build({ AAA: [0, 990, 1500, 3200] }, { trackStatus: [[1, "vsc"], [3, "clear"]] }));
  assert.equal(lapAt(r, 0), 1);
  assert.equal(lapAt(r, 2), 2);
  assert.equal(lapAt(r, 3), 3, "capped at the race distance (3 laps)");
  assert.equal(statusAt(r.header, 0), "clear");
  assert.equal(statusAt(r.header, 2), "vsc");
  assert.equal(statusAt(r.header, 3), "clear");
});

// --- loading: missing, corrupted, already decompressed, cancelled -------------------------------------------------
import { gzipSync } from "node:zlib";
import { isAbortError, loadReplay, ReplayUnavailableError } from "../raceReplay";

async function withFetch(impl: typeof fetch, run: () => Promise<void>) {
  const saved = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = saved;
  }
}
const plain = new Uint8Array(build({ LEC: [0, 30, 60], HAM: [-8, 20, 50] }));

test("loads a gzipped replay", async () => {
  await withFetch(async () => new Response(gzipSync(plain)), async () => {
    const r = await loadReplay("/replays/x.bin");
    assert.deepEqual([...r.distances.LEC], [0, 30, 60]);
  });
});

test("loads a replay the network already decompressed (Content-Encoding: gzip), without decompressing it twice", async () => {
  await withFetch(async () => new Response(plain), async () => {
    const r = await loadReplay("/replays/x.bin");
    assert.deepEqual([...r.distances.HAM], [-8, 20, 50]);
  });
});

test("a missing file (404) is 'unavailable', not a crash", async () => {
  await withFetch(async () => new Response("not found", { status: 404 }), async () => {
    await assert.rejects(loadReplay("/replays/gone.bin"), (e) => e instanceof ReplayUnavailableError && /404/.test(e.message));
  });
});

test("corrupted gzip data is 'unavailable'", async () => {
  const bad = gzipSync(plain);
  bad[bad.length - 12] ^= 0xff; // flip bits inside the compressed stream
  await withFetch(async () => new Response(bad), async () => {
    await assert.rejects(loadReplay("/replays/x.bin"), ReplayUnavailableError);
  });
  await withFetch(async () => new Response(Uint8Array.from([0x1f, 0x8b, 1, 2, 3])), async () => {
    await assert.rejects(loadReplay("/replays/x.bin"), ReplayUnavailableError, "a truncated gzip");
  });
});

test("a network failure is 'unavailable'", async () => {
  await withFetch(async () => { throw new TypeError("fetch failed"); }, async () => {
    await assert.rejects(loadReplay("/replays/x.bin"), ReplayUnavailableError);
  });
});

test("a cancelled load rejects as an abort, never as 'unavailable'", async () => {
  const ac = new AbortController();
  await withFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      }),
    async () => {
      const p = loadReplay("/replays/x.bin", ac.signal);
      ac.abort();
      await assert.rejects(p, (e) => isAbortError(e) && !(e instanceof ReplayUnavailableError));
    },
  );
  assert.equal(isAbortError(new ReplayUnavailableError("x")), false);
});

import { leadChanges } from "../raceReplay";

test("lead changes: each real change once, a momentary flip dropped", () => {
  // hz 2. AAA leads; BBB passes at sample 4 and stays ahead; CCC is ahead of BBB for one sample only (noise).
  const r = decodeReplay(
    build(
      {
        AAA: [100, 130, 160, 190, 205, 220, 235, 250, 265, 280, 295, 310, 325, 340, 355, 370, 385, 400, 415, 430, 445],
        BBB: [90, 125, 158, 189, 215, 245, 275, 305, 335, 365, 395, 425, 455, 485, 515, 545, 575, 605, 635, 665, 695],
        CCC: [80, 110, 140, 170, 200, 230, 260, 290, 320, 350, 380, 410, 470, 480, 510, 540, 570, 600, 630, 660, 690],
      },
      { hz: 2, lapLengthM: 10_000, totalLaps: 1 },
    ),
  );
  const changes = leadChanges(r);
  assert.deepEqual(changes.map((c) => [c.sample, c.code]), [[4, "BBB"]], "CCC's one-sample lead at 12 flips straight back and is noise");
});
