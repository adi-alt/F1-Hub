"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bot, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { Picker } from "@/components/ui/Picker";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatLocalDateTime, parseUtcDateTime } from "@/lib/countdown";
import { MARGIN_BUCKETS, type MarginBucket, type RaceDoc, type UserPick } from "@/lib/types/race";
import { teamColor } from "@/lib/teamColors";
import { CATEGORY_MAX, MAX_PICK_POINTS, scorePick, type CategoryScore, type PickCategory } from "@/lib/pickScoring";

export type Entrant = { driver: string; driverName: string; team: string; headshotUrl?: string | null };
type Session = { label: string; date: string };

/** The rate the race simulation samples safety cars at (pipeline/ml/simulate_race.py GLOBAL_SC_RATE): no
 * circuit-specific signal beat it, so it is the model's honest answer for every race. */
const MODEL_SAFETY_CAR_RATE = 0.734;

const MARGIN_LABEL: Record<MarginBucket, string> = { under_2: "Under 2s", "2_5": "2–5s", "5_10": "5–10s", over_10: "Over 10s" };
const MARGIN_DESCRIPTION: Record<MarginBucket, string> = {
  under_2: "P2 within 2 seconds of the winner",
  "2_5": "P2 2 to 5 seconds behind",
  "5_10": "P2 5 to 10 seconds behind",
  over_10: "P2 more than 10 seconds behind",
};

type Form = {
  podium: [string, string, string];
  pole: string;
  fastestLap: string;
  top5: [string, string, string, string, string];
  safetyCar: boolean | null;
  margin: MarginBucket | null;
};

const EMPTY: Form = { podium: ["", "", ""], pole: "", fastestLap: "", top5: ["", "", "", "", ""], safetyCar: null, margin: null };

function fromPick(p: UserPick): Form {
  return {
    podium: p.predictedPodium,
    pole: p.predictedPole ?? "",
    fastestLap: p.predictedFastestLap ?? "",
    top5: p.predictedTop5 ?? ["", "", "", "", ""],
    safetyCar: p.predictedSafetyCar ?? null,
    margin: p.predictedMargin ?? null,
  };
}

/** What the models say for each category, from data already on the race. Null where a model has nothing yet. */
export function modelPicks(race: RaceDoc) {
  const sim = race.simulation?.drivers?.length ? race.simulation.drivers : null;
  const order = race.prediction?.finishOrder?.slice().sort((a, b) => a.predictedPosition - b.predictedPosition) ?? [];
  const pace = race.prediction?.predictedPaceGapSec ?? {};
  const fastest = Object.entries(pace).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
  const pole = race.polePrediction?.order?.slice().sort((a, b) => a.predictedQualiPosition - b.predictedQualiPosition)[0]?.driver ?? null;
  return {
    podium: sim ? [...sim].sort((a, b) => b.podium - a.podium).slice(0, 3).map((d) => d.driver) : order.slice(0, 3).map((o) => o.driver),
    winnerChance: sim ? Math.max(...sim.map((d) => d.p1)) : null,
    pole,
    fastestLap: fastest,
    top5: sim ? [...sim].sort((a, b) => b.top5 - a.top5).slice(0, 5).map((d) => d.driver) : order.slice(0, 5).map((o) => o.driver),
    safetyCar: MODEL_SAFETY_CAR_RATE,
  };
}

function sessionTime(sessions: Session[], label: string): number | null {
  const s = sessions.find((x) => x.label.toLowerCase() === label);
  return s ? parseUtcDateTime(s.date).getTime() : null;
}

// Each category's points, as compute_group_scores.py scores them (lib/pickScoring.ts).
const POINTS = CATEGORY_MAX;
const MAX_POINTS = MAX_PICK_POINTS;

/** After the race: what this category scored, as a badge in the card's corner. */
function Outcome({ score }: { score: CategoryScore | undefined }) {
  if (!score || score.outcome === "unpicked" || score.outcome === "pending") return null;
  const tone = score.outcome === "exact" ? "bg-success/15 text-success" : score.outcome === "partial" ? "bg-warning/15 text-warning" : "bg-surface-3 text-secondary";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-medium tabular ${tone}`}>
      +{score.earned}
      {score.detail ? ` · ${score.detail}` : score.outcome === "exact" ? " · right" : " · missed"}
    </span>
  );
}

/** One category as a card: its name (with a tick once it's filled), what it's worth, the model's pick, then the
 * control; once the race is scored, what it earned. `compact` is for the row of four small cards: the points sit in
 * the corner as a short "+3 pts" ("if right" for screen readers and on hover) and the model line keeps two lines'
 * height, so all four controls start on one line
 * whatever the text above them; a note goes under the control. */
function Category({ title, points, model, done, score, note, compact = false, children }: { title: string; points: string; model: ReactNode; done: boolean; score?: CategoryScore; note?: ReactNode; compact?: boolean; children: ReactNode }) {
  const result = score && score.earned !== null;
  const chip = result ? (
    <Outcome score={score} />
  ) : (
    <span title={compact ? `${points.replace(/^\+/, "")} if right` : undefined} className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-caption tabular text-secondary">
      {points}
      {compact && <span className="sr-only"> if right</span>}
    </span>
  );
  return (
    <section aria-label={title} className="flex min-w-0 flex-col rounded-card border border-subtle bg-surface-2/60 p-4">
      <div className={compact ? "flex items-center justify-between gap-2" : "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"}>
        <h3 className="flex items-center gap-1.5 whitespace-nowrap text-body-sm font-semibold text-primary">
          {title}
          {done && !result && <Icon icon={Check} size={16} className="text-success" label="Picked" />}
        </h3>
        {chip}
      </div>
      <p className={`mt-2 flex items-start gap-1.5 text-caption text-secondary ${compact ? "min-h-10" : ""}`}>
        <Icon icon={Bot} size={16} className="shrink-0 text-tertiary" />
        <span className="min-w-0">{model}</span>
      </p>
      <div className="mt-3">{children}</div>
      {note && <p className="mt-2 text-caption text-tertiary">{note}</p>}
    </section>
  );
}

/** The podium as a podium: the three pickers on one line (P2, P1, P3 from sm up), and under them the steps rising
 * from one shared base, each in its driver's team colour once picked. */
function PodiumStep({ place, code, color, modelName, children }: { place: 1 | 2 | 3; code: string; color: string | null; modelName: string | null; children: ReactNode }) {
  const height = place === 1 ? "h-16" : place === 2 ? "h-11" : "h-8";
  return (
    <div className={`flex min-w-0 flex-col ${place === 1 ? "sm:order-2" : place === 2 ? "sm:order-1" : "sm:order-3"}`}>
      {children}
      <div aria-hidden className="mt-3 hidden h-16 items-end border-b border-white/15 sm:flex">
        <div
          className={`flex w-full items-start justify-center rounded-t-control border-x border-t pt-1.5 text-body font-semibold tabular transition-[background-color,border-color] duration-base ${height} ${code ? "border-white/15 text-primary" : "border-dashed border-subtle text-tertiary"}`}
          style={code && color ? { background: `linear-gradient(180deg, ${color}55, ${color}14)` } : undefined}
        >
          {place}
        </div>
      </div>
      {modelName && <p className="mt-2 truncate text-caption text-tertiary">Model: {modelName}</p>}
    </div>
  );
}

/** Yes or no as two separate buttons, each with its own mark, and a selected state that can't be mistaken: yes in
 * the success tone, no in a strong neutral. Clicking the chosen one again clears it. */
function YesNo({ value, onChange, disabled, label }: { value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean; label: string }) {
  const option = (v: boolean) => {
    const on = value === v;
    const look = on
      ? v
        ? "border-success/70 bg-success/15 text-primary"
        : "border-white/50 bg-surface-3 text-primary"
      : "border-subtle text-secondary hover:border-strong hover:text-primary";
    return (
      <button
        key={String(v)}
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(on ? null : v)}
        className={`flex h-10 items-center justify-center gap-1.5 rounded-control border text-body-sm font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${look}`}
      >
        <Icon icon={v ? Check : X} size={16} className={on && v ? "text-success" : undefined} />
        {v ? "Yes" : "No"}
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {option(true)}
      {option(false)}
    </div>
  );
}

/**
 * The prediction window: every category the models predict, in one place, each with the model's own pick beside
 * it and its points. Opens over the page (home or race), so a pick is a few taps, not a trip to another page.
 * Pole locks when qualifying starts, the rest at lights out (save_pick enforces both); the podium is required,
 * every other category optional.
 */
export function PredictionSheet({
  open,
  onClose,
  race,
  entrants,
  sessions,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  race: RaceDoc;
  entrants: Entrant[];
  sessions: Session[];
  onSaved?: (pick: UserPick) => void;
}) {
  const now = useMinuteClock();
  const tz = useViewerTimeZone();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/picks?raceId=${encodeURIComponent(race.id)}`)
      .then((r) => r.json())
      .then((d: { pick: UserPick | null }) => {
        if (cancelled) return;
        setForm(d.pick ? fromPick(d.pick) : EMPTY);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [open, race.id]);

  const raceAt = sessionTime(sessions, "race");
  // Open 24h before the weekend's first session (save_pick enforces the same, 20261012_pick_window.sql).
  const firstSession = sessions.length ? Math.min(...sessions.map((s) => parseUtcDateTime(s.date).getTime())) : null;
  const opensAt = firstSession !== null ? firstSession - 24 * 3600 * 1000 : null;
  const notOpen = opensAt !== null && now < opensAt;
  const qualiAt = sessionTime(sessions, "qualifying");
  const locked = notOpen || race.status === "completed" || (raceAt !== null && now >= raceAt);
  const poleLocked = locked || (qualiAt !== null && now >= qualiAt);
  const model = modelPicks(race);
  const nameOf = (code: string | null) => (code ? entrants.find((e) => e.driver === code)?.driverName ?? code : null);
  const drivers = entrants.map((e) => ({ code: e.driver, name: e.driverName, team: e.team, color: teamColor(e.team), headshotUrl: e.headshotUrl ?? null }));
  const modelList = (codes: string[]) => codes.map((c) => nameOf(c)).join(", ");

  function setTop5(i: number, code: string) {
    setForm((f) => {
      const next = [...f.top5] as Form["top5"];
      next[i] = code;
      return { ...f, top5: next };
    });
  }

  async function save() {
    const [p1, p2, p3] = form.podium;
    if (!p1 || !p2 || !p3 || new Set(form.podium).size !== 3) return setMessage({ tone: "error", text: "Pick three different drivers for the podium." });
    const top5Filled = form.top5.filter(Boolean);
    if (top5Filled.length > 0 && (top5Filled.length !== 5 || new Set(top5Filled).size !== 5)) return setMessage({ tone: "error", text: "Pick five different drivers for the top five, or leave it empty." });
    setSaving(true);
    setMessage(null);
    const body: Omit<UserPick, "submittedAt"> = {
      raceId: race.id,
      predictedWinner: p1,
      predictedPodium: [p1, p2, p3],
      predictedPole: form.pole || null,
      predictedFastestLap: form.fastestLap || null,
      predictedTop5: top5Filled.length === 5 ? form.top5 : null,
      predictedSafetyCar: form.safetyCar,
      predictedMargin: form.margin,
    };
    const res = await fetch("/api/picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const err = (await res?.json().catch(() => null)) as { error?: string } | null;
      return setMessage({ tone: "error", text: err?.error ?? "Couldn't save. Try again." });
    }
    setMessage({ tone: "ok", text: "Saved. You can change it until the lock." });
    onSaved?.({ ...body, submittedAt: new Date().toISOString() });
  }

  const raceClose = raceAt ? formatLocalDateTime(new Date(raceAt).toISOString(), tz) : null;
  const qualiClose = qualiAt ? formatLocalDateTime(new Date(qualiAt).toISOString(), tz) : null;
  const colorOf = (code: string) => (code ? teamColor(entrants.find((e) => e.driver === code)?.team ?? "") : null);

  // What's filled in, for the ticks and the summary in the footer.
  const done = {
    podium: form.podium.every(Boolean),
    pole: !!form.pole,
    fastestLap: !!form.fastestLap,
    top5: form.top5.every(Boolean),
    safetyCar: form.safetyCar !== null,
    margin: form.margin !== null,
  };
  const filled = Object.values(done).filter(Boolean).length;
  const score = scorePick(
    { predictedPodium: form.podium, predictedPole: form.pole || null, predictedFastestLap: form.fastestLap || null, predictedTop5: form.top5.every(Boolean) ? form.top5 : null, predictedSafetyCar: form.safetyCar, predictedMargin: form.margin },
    race,
  );
  const inPlay = score.possible;
  const scoreOf = (c: PickCategory) => score.categories.find((x) => x.category === c);

  // One line on where the window stands: not open yet, open until lights out, or closed.
  // Only claim a model view that exists: before qualifying the race models haven't published anything.
  const hasModel = model.podium.length > 0 || !!model.pole || !!model.fastestLap || model.top5.length > 0;
  const windowLine = notOpen && opensAt
    ? (
        <>
          Opens <span suppressHydrationWarning>{formatLocalDateTime(new Date(opensAt).toISOString(), tz)}</span>, 24 hours before the first session.{" "}
          {hasModel ? "Until then, here's what the models think so far." : "The models publish as the weekend runs: the pace model after practice, pole before qualifying, the race after it."}
        </>
      )
    : locked
      ? "Predictions are closed for this race."
      : <>The podium is required; everything else is optional.{raceClose && <> Locks at lights out, <span suppressHydrationWarning>{raceClose}</span>.</>}</>;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={`Your predictions: ${race.name}`}
      description={windowLine}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-subtle pt-4">
          <div className="min-w-0">
            {score.scored ? (
              <p className="text-body-sm text-primary">
                You scored <span className="tabular font-semibold">{score.earned}</span> point{score.earned === 1 ? "" : "s"}
                <span className="text-secondary"> of the {inPlay} your picks could earn ({MAX_POINTS} for a perfect weekend)</span>
              </p>
            ) : (
              <p className="text-body-sm text-primary">
                <span className="tabular font-semibold">{filled}</span> of 6 picked
                <span className="text-secondary"> · if they&apos;re all right: <span className="tabular font-semibold text-primary">{inPlay}</span> of {MAX_POINTS} points</span>
              </p>
            )}
            <p role="status" className={`min-h-5 text-caption ${message?.tone === "error" ? "text-danger" : "text-success"}`}>
              {message?.text}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose}>
              Close
            </Button>
            {!locked && (
              <Button variant="primary" size="md" loading={saving} disabled={!loaded} onClick={() => void save()}>
                Save predictions
              </Button>
            )}
          </div>
        </div>
      }
    >
      {!loaded ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton shape="block" className="h-48" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} shape="block" className="h-32" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 pb-1">
          <Category
            title="Podium" score={scoreOf("podium")}
            points={`Up to ${POINTS.podium} pts · 3 per exact place, 1 if on the podium`}
            done={done.podium}
            model={model.podium.length ? <>Model: {modelList(model.podium)}{model.winnerChance !== null ? ` · ${Math.round(model.winnerChance * 100)}% to win` : ""}</> : "The model publishes after qualifying."}
          >
            <div className="grid gap-3 sm:grid-cols-3 sm:items-start">
              {([1, 2, 3] as const).map((place) => (
                <PodiumStep key={place} place={place} code={form.podium[place - 1]} color={colorOf(form.podium[place - 1])} modelName={nameOf(model.podium[place - 1] ?? null)}>
                  <label className="text-caption text-secondary">
                    P{place}
                    <DriverPicker
                      drivers={drivers}
                      value={form.podium[place - 1]}
                      disabled={locked}
                      ariaLabel={`Podium P${place}`}
                      className="mt-1"
                      onChange={(code) => setForm((f) => ({ ...f, podium: f.podium.map((c, j) => (j === place - 1 ? code : c)) as Form["podium"] }))}
                    />
                  </label>
                </PodiumStep>
              ))}
            </div>
          </Category>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Category
              title="Pole position" compact score={scoreOf("pole")}
              points={`+${POINTS.pole} pts`}
              done={done.pole}
              model={model.pole ? <>Model: {nameOf(model.pole)}</> : "Publishes before qualifying."}
              note={poleLocked && !locked ? "Qualifying has started: locked." : !poleLocked && qualiClose ? <>Locks at qualifying, <span suppressHydrationWarning>{qualiClose}</span>.</> : null}
            >
              <DriverPicker drivers={drivers} value={form.pole} disabled={poleLocked} ariaLabel="Pole position" onChange={(code) => setForm((f) => ({ ...f, pole: code }))} />
            </Category>
            <Category title="Fastest lap" compact score={scoreOf("fastestLap")} points={`+${POINTS.fastestLap} pts`} done={done.fastestLap} model={model.fastestLap ? <>Model: {nameOf(model.fastestLap)}, best race pace</> : "Publishes after practice."}>
              <DriverPicker drivers={drivers} value={form.fastestLap} disabled={locked} ariaLabel="Fastest lap" onChange={(code) => setForm((f) => ({ ...f, fastestLap: code }))} />
            </Category>
            <Category title="Safety car" compact score={scoreOf("safetyCar")} points={`+${POINTS.safetyCar} pts`} done={done.safetyCar} model={<>History: {Math.round(model.safetyCar * 100)}% of races have one</>}>
              <YesNo label="Safety car" value={form.safetyCar} disabled={locked} onChange={(v) => setForm((f) => ({ ...f, safetyCar: v }))} />
            </Category>
            <Category title="Winning margin" compact score={scoreOf("margin")} points={`+${POINTS.margin} pts`} done={done.margin} model="No model pick: your call.">
              <Picker
                ariaLabel="Winning margin"
                placeholder="Select a gap"
                value={form.margin ?? ""}
                disabled={locked}
                clearable
                onChange={(v) => setForm((f) => ({ ...f, margin: (v || null) as MarginBucket | null }))}
                options={MARGIN_BUCKETS.map((b) => ({ value: b, label: MARGIN_LABEL[b], description: MARGIN_DESCRIPTION[b] }))}
              />
            </Category>
          </div>

          <Category title="Top five" score={scoreOf("top5")} points={`Up to ${POINTS.top5} pts · 1 per driver, any order`} done={done.top5} model={model.top5.length ? <>Model: {modelList(model.top5)}</> : "The model publishes after qualifying."}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {form.top5.map((code, i) => (
                <DriverPicker key={i} drivers={drivers} value={code} disabled={locked} placeholder={`#${i + 1}`} ariaLabel={`Top five, driver ${i + 1}`} onChange={(c) => setTop5(i, c)} />
              ))}
            </div>
          </Category>


        </div>
      )}
    </Dialog>
  );
}
