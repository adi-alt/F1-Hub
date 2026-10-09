"use client";

import { useEffect, useState } from "react";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatCountdown, formatLocalDateTime, parseUtcDateTime } from "@/lib/countdown";
import { useAuth } from "@/providers/AuthProvider";
import { PredictionSheet } from "@/components/predictions/PredictionSheet";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { RaceDoc, UserPick } from "@/lib/types/race";


// Shaped like the real card (label + P1/P2/P3 selects) - `useAuth`'s auth check is genuine async
// work on first paint, unlike a synchronous tab switch elsewhere on this page.
function PickPanelSkeleton() {
  return (
    <div className="rounded-card bg-surface-1 p-5">
      <Skeleton shape="block" className="h-3 w-32" />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {["P1", "P2", "P3"].map((label) => (
          <div key={label}>
            <Skeleton shape="block" className="h-3 w-6" />
            <Skeleton shape="block" className="mt-1 h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PickPanel({
  race,
  fallbackEntrants = [],
  raceSessionDate,
  sessions = [],
}: {
  race: RaceDoc;
  fallbackEntrants?: { driver: string; driverName: string; team: string }[];
  // The "Race" session's own real datetime (from `calendar`, see RaceWeekendPanel) - `race.status`
  // alone can't tell "race in progress" apart from "still upcoming" (the pipeline that would flip
  // it to "completed" runs on a batch schedule, not live - see races.ts's getRace docstring), so
  // this is the one honest, real signal this app has for "picks should be closing." Note this is a
  // client-side-only close, for the UI's sake - the actual save is still gated purely on
  // race.status server-side (saveUserPick, picks.ts), which is a real, pre-existing gap this alone
  // doesn't close (someone hitting the API directly could still save mid-race until the pipeline
  // catches up) - out of scope here, a genuine follow-up if picks-as-scoring integrity matters.
  raceSessionDate?: string | null;
  /** The weekend's sessions, for the prediction window's locks (pole at qualifying). */
  sessions?: { label: string; date: string }[];
}) {
  const { isAuthorized, loading } = useAuth();
  const now = useMinuteClock();
  const tz = useViewerTimeZone();
  const [saved, setSaved] = useState<UserPick | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // isAuthorized, not raw user — a session mid-OTP-flow isn't a real one yet.
    if (!isAuthorized) return;
    // Goes through the session-aware /api/picks endpoint (iron-session + Admin SDK), not a direct
    // client Firestore read — see api/picks/route.ts for why this is a separate small endpoint
    // rather than reading cookies() in the (ISR-cached) race page itself.
    fetch(`/api/picks?raceId=${encodeURIComponent(race.id)}`)
      .then((res) => res.json())
      .then((data: { pick: UserPick | null }) => setSaved(data.pick))
      .catch(() => setSaved(null));
  }, [isAuthorized, race.id]);

  if (loading) return <PickPanelSkeleton />;

  if (!isAuthorized) {
    return (
      <div className="rounded-card bg-surface-1 p-5 text-sm text-neutral-400">
        Sign in to make your predictions for this race.
      </div>
    );
  }

  // Opens 24 hours before the weekend's first session (save_pick enforces the same).
  const firstSession = sessions.length ? Math.min(...sessions.map((x) => parseUtcDateTime(x.date).getTime())) : null;
  if (firstSession !== null && now < firstSession - 24 * 3600 * 1000) {
    const opensAt = firstSession - 24 * 3600 * 1000;
    return (
      <div className="rounded-card bg-surface-1 p-5">
        <p className="text-body-sm font-semibold text-primary">Predictions open {formatLocalDateTime(new Date(opensAt).toISOString(), tz)}</p>
        <p className="mt-1 text-caption text-secondary">24 hours before the first session, and close at lights out{raceSessionDate ? `, ${formatLocalDateTime(raceSessionDate, tz)}` : ""}.</p>
      </div>
    );
  }

  // race.inputs (this race's own qualifying-derived grid) once it exists, else the current
  // grid (fallbackEntrants, from getCurrentEntrants) - so a pick can be made for the whole
  // pre-qualifying window instead of only once this race's own quali has happened.
  const entrants = race.inputs?.length ? race.inputs : fallbackEntrants;
  if (entrants.length === 0) {
    return (
      <div className="rounded-card bg-surface-1 p-5 text-sm text-neutral-400">
        Predictions open once this race weekend begins.
      </div>
    );
  }

  const isLocked = race.status !== "upcoming" || (!!raceSessionDate && parseUtcDateTime(raceSessionDate).getTime() <= now);
  const nameOf = (code: string | null | undefined) => (code ? entrants.find((e) => e.driver === code)?.driverName ?? code : null);
  const rows: [string, string | null][] = saved
    ? [
        ["Podium", saved.predictedPodium.map((c) => nameOf(c)).join(", ")],
        ["Pole", nameOf(saved.predictedPole)],
        ["Fastest lap", nameOf(saved.predictedFastestLap)],
        ["Top five", saved.predictedTop5 ? saved.predictedTop5.map((c) => nameOf(c)).join(", ") : null],
        ["Safety car", saved.predictedSafetyCar === null || saved.predictedSafetyCar === undefined ? null : saved.predictedSafetyCar ? "Yes" : "No"],
        ["Winning margin", saved.predictedMargin ? { under_2: "Under 2s", "2_5": "2–5s", "5_10": "5–10s", over_10: "Over 10s" }[saved.predictedMargin] : null],
      ]
    : [];

  return (
    <div className="rounded-card bg-surface-1 p-5">
      {saved ? (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-caption text-secondary">{label}</dt>
              <dd className={`mt-0.5 truncate text-body-sm ${value ? "text-primary" : "text-tertiary"}`}>{value ?? "Not picked"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-body-sm text-secondary">{isLocked ? "You didn't make predictions for this race." : "No predictions yet. Six categories, each against the model."}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {!isLocked && (
          <Button variant="primary" size="md" onClick={() => setOpen(true)}>
            {saved ? "Edit predictions" : "Make your predictions"}
          </Button>
        )}
        {isLocked && saved && (
          <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
            View predictions
          </Button>
        )}
        {raceSessionDate && (
          <p className="text-caption text-tertiary">
            {isLocked
              ? `Closed at lights out, ${formatLocalDateTime(raceSessionDate, tz)}.`
              : `Close at lights out, ${formatLocalDateTime(raceSessionDate, tz)} (in ${formatCountdown(parseUtcDateTime(raceSessionDate).getTime(), now)}).`}
          </p>
        )}
      </div>
      <PredictionSheet open={open} onClose={() => setOpen(false)} race={race} entrants={entrants} sessions={sessions} onSaved={setSaved} />
    </div>
  );
}
