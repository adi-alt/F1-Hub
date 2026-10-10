// A race replay (pipeline/race_replay.py): every car's distance since lights out, two samples a second, in a small
// gzipped binary. Client-safe: decoding, and what the replay view needs at any moment (where each car is, the
// running order, the lap, the flags).

export type ReplayCar = { code: string; number: string; team: string | null; color: string | null; name: string | null };
export type TrackStatus = "clear" | "yellow" | "sc" | "red" | "vsc" | "vsc_ending";

export type ReplayHeader = {
  version: number;
  hz: number;
  startUtc: number;
  samples: number;
  lapLengthM: number;
  totalLaps: number | null;
  cars: ReplayCar[];
  stepBytes: number[];
  /** [car code, first sample, last sample] the car was in the pits. */
  pits: [string, number, number][];
  /** car code -> the sample it retired at. */
  retired: Record<string, number>;
  /** [sample, status], in order. */
  trackStatus: [number, TrackStatus][];
  outline: [number, number][];
  corners: { number: number; letter: string; x: number; y: number }[];
  rotation: number | null;
  startFinish: { x: number; y: number; verified: boolean };
};

export type Replay = { header: ReplayHeader; distances: Record<string, Float32Array> };

export const REPLAY_VERSION = 1;
const ESCAPE = -128;

/** The replay from its (already decompressed) bytes: a 4-byte header length, the JSON header, then each car's
 * steps - an int16 start, then one int8 per sample (ESCAPE + int16 for a big pit-lane jump). Throws on anything
 * that doesn't add up, rather than drawing a car in the wrong place. */
export function decodeReplay(buf: ArrayBuffer): Replay {
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as ReplayHeader;
  if (header.version !== REPLAY_VERSION) throw new Error(`replay version ${header.version} unsupported`);
  if (header.cars.length !== header.stepBytes.length) throw new Error("replay header is inconsistent");
  const distances: Record<string, Float32Array> = {};
  let pos = 4 + n;
  header.cars.forEach((car, k) => {
    const end = pos + header.stepBytes[k];
    if (end > buf.byteLength) throw new Error("replay is truncated");
    const out = new Float32Array(header.samples);
    let i = pos;
    let cur = view.getInt16(i, true);
    i += 2;
    out[0] = cur;
    let j = 1;
    while (i < end) {
      let step = view.getInt8(i);
      i += 1;
      if (step === ESCAPE) {
        step = view.getInt16(i, true);
        i += 2;
      }
      cur += step;
      if (j < out.length) out[j++] = cur;
    }
    if (j !== header.samples) throw new Error(`replay car ${car.code}: ${j} samples, expected ${header.samples}`);
    distances[car.code] = out;
    pos = end;
  });
  return { header, distances };
}

/** Fetches and decodes a replay file (gzipped), with the browser's own decompressor. */
export async function loadReplay(url: string, signal?: AbortSignal): Promise<Replay> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`replay ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return decodeReplay(await new Response(stream).arrayBuffer());
}

/** A car's distance at a fractional sample: interpolated between the two samples either side. */
export function distanceAt(d: Float32Array, t: number): number {
  const i = Math.max(0, Math.min(d.length - 1, Math.floor(t)));
  const j = Math.min(d.length - 1, i + 1);
  return d[i] + (d[j] - d[i]) * Math.min(1, Math.max(0, t - i));
}

export function inPit(header: ReplayHeader, code: string, t: number): boolean {
  return header.pits.some(([c, a, b]) => c === code && t >= a && t <= b);
}

export function isRetired(header: ReplayHeader, code: string, t: number): boolean {
  const at = header.retired[code];
  return at !== undefined && t >= at;
}

/** The track status in force at sample `t`. */
export function statusAt(header: ReplayHeader, t: number): TrackStatus {
  let s: TrackStatus = "clear";
  for (const [at, status] of header.trackStatus) {
    if (at > t) break;
    s = status;
  }
  return s;
}

export type Standing = { code: string; distance: number; pit: boolean; retired: boolean; gapS: number | null };

/** The running order at sample `t`: furthest first, retired cars last. The gap is the time the car takes to reach
 * where the car ahead is now - from its own recent pace, so it reads like a timing screen's interval. */
export function standingsAt(replay: Replay, t: number): Standing[] {
  const { header, distances } = replay;
  const rows = header.cars.map((c) => {
    const d = distances[c.code];
    const pit = header.pits.find(([code, a, b]) => code === c.code && t >= a && t <= b);
    // In the pits a car isn't on the traced line, so its distance there means nothing: it holds the distance it
    // had going in. A pit-lane start (in the pits from the first sample) is behind the whole grid until it leaves.
    const distance = !pit ? distanceAt(d, t) : pit[1] === 0 ? Math.min(...header.cars.map((o) => distances[o.code][0])) - 1 : d[Math.max(0, pit[1] - 1)];
    return { code: c.code, distance, pit: Boolean(pit), retired: isRetired(header, c.code, t) };
  });
  rows.sort((a, b) => Number(a.retired) - Number(b.retired) || b.distance - a.distance);
  return rows.map((r, i) => {
    if (i === 0 || r.retired) return { ...r, gapS: null };
    const d = distances[r.code];
    const back = Math.max(0, t - 10 * header.hz);
    const speed = (distanceAt(d, t) - distanceAt(d, back)) / Math.max(1e-6, (t - back) / header.hz); // metres per second
    const ahead = rows[i - 1].distance - r.distance;
    return { ...r, gapS: speed > 5 ? ahead / speed : null };
  });
}

/** The leader's lap at sample `t` (1-based), capped at the race distance. */
export function lapAt(replay: Replay, t: number): number {
  const lead = Math.max(...replay.header.cars.map((c) => distanceAt(replay.distances[c.code], t)));
  const lap = Math.floor(Math.max(0, lead) / replay.header.lapLengthM) + 1;
  return replay.header.totalLaps ? Math.min(lap, replay.header.totalLaps) : lap;
}
