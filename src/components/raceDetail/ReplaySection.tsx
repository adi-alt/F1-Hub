"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { isAbortError, loadReplay, type Replay } from "@/lib/raceReplay";
import type { ReplayEntry } from "@/lib/replayManifest";
import { RaceReplay } from "./RaceReplay";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; replay: Replay } | { kind: "unavailable" };

/**
 * The race replay, downloaded only when asked for: until the visitor presses Play, the page fetches nothing (the
 * file is ~150 KB, and most visitors never watch). Rendered only for a race the replay manifest has an entry for.
 * A load that fails (missing file, unreadable data) says so quietly, with a retry; a load cancelled by leaving the
 * page is no error at all.
 */
export function ReplaySection({ entry }: { entry: ReplayEntry }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function start() {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setState({ kind: "loading" });
    try {
      const replay = await loadReplay(entry.file, ac.signal);
      if (!ac.signal.aborted) setState({ kind: "ready", replay });
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) return;
      console.warn(e instanceof Error ? e.message : e);
      setState({ kind: "unavailable" });
    }
  }

  if (state.kind === "ready") return <RaceReplay replay={state.replay} autoPlay />;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-replay-state={state.kind}>
      <button
        type="button"
        onClick={start}
        disabled={state.kind === "loading"}
        className="flex items-center gap-2 rounded-control border border-subtle px-3 py-2 text-body-sm font-medium text-primary transition-colors hover:bg-white/[0.06] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Play aria-hidden size={16} />
        {state.kind === "loading" ? "Loading the replay…" : state.kind === "unavailable" ? "Try again" : "Watch the race replay"}
      </button>
      <p className="text-caption text-tertiary" aria-live="polite">
        {state.kind === "unavailable"
          ? "The replay couldn't be loaded."
          : `Every car on the real circuit, lights out to the flag · ${Math.round(entry.bytes / 1000)} KB`}
      </p>
    </div>
  );
}
