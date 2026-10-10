// Which races have a replay (pipeline/race_replay.py --publish writes src/data/replays.json). Read on the server
// only - the race pages pass just their own race's entry down - so the browser bundle never carries the whole
// list. A race with no entry has no replay, and its page never requests one.
import manifest from "@/data/replays.json";
import { REPLAY_VERSION } from "./raceReplay";

export type ReplayEntry = { file: string; bytes: number; sha256: string; version: number };

const FILE = /^\/replays\/\d{4}-\d{1,2}\.[0-9a-f]{8}\.bin$/;

/** True for an entry this app can play: the current format, a content-hashed file under /replays/. */
export function isPlayableEntry(e: unknown): e is ReplayEntry {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return (
    r.version === REPLAY_VERSION &&
    typeof r.file === "string" &&
    FILE.test(r.file) &&
    typeof r.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(r.sha256) &&
    r.file.includes(`.${r.sha256.slice(0, 8)}.`) &&
    typeof r.bytes === "number" &&
    r.bytes > 0
  );
}

/** The replay for a season and round, or null when there's none (or it's in a format this build can't play). */
export function replayFor(year: number, round: number, entries: Record<string, unknown> = manifest): ReplayEntry | null {
  const e = entries[`${year}-${round}`];
  return isPlayableEntry(e) ? e : null;
}
