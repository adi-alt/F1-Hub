"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatLocalDateTime, parseUtcDateTime } from "@/lib/countdown";
import { MARGIN_BUCKETS, type MarginBucket, type RaceDoc, type UserPick } from "@/lib/types/race";

export type Entrant = { driver: string; driverName: string; team: string };
type Session = { label: string; date: string };

/** The rate the race simulation samples safety cars at (pipeline/ml/simulate_race.py GLOBAL_SC_RATE): no
 * circuit-specific signal beat it, so it is the model's honest answer for every race. */
const MODEL_SAFETY_CAR_RATE = 0.734;

const MARGIN_LABEL: Record<MarginBucket, string> = { under_2: "Under 2s", "2_5": "2–5s", "5_10": "5–10s", over_10: "Over 10s" };

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

/** One category: its name and points on one line, the model's pick under it, then the control. */
function Category({ title, points, model, locked, children }: { title: string; points: string; model: ReactNode; locked?: string | null; children: ReactNode }) {
  return (
    <section className="border-t border-subtle py-5 first:border-t-0 first:pt-0" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-body font-semibold text-primary">{title}</h3>
        <span className="text-caption tabular text-secondary">{points}</span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-caption text-secondary">
        <Icon icon={Bot} size={16} className="shrink-0 text-tertiary" />
        {model}
      </p>
      {locked && <p className="mt-1 text-caption text-warning">{locked}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Segmented<T extends string | boolean>({ options, value, onChange, disabled, label }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T | null) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(on ? null : o.value)}
            className={`h-10 rounded-control border px-4 text-body-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 ${on ? "border-primary bg-surface-3 text-primary" : "border-subtle text-secondary hover:border-strong hover:text-primary"}`}
          >
            {o.label}
          </button>
        );
      })}
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
  const drivers = entrants.map((e) => ({ code: e.driver, name: e.driverName, team: e.team }));
  const modelList = (codes: string[]) => (codes.length ? codes.map((c) => nameOf(c)).join(", ") : null);

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Your predictions: ${race.name}`}
      description={notOpen && opensAt ? `Predictions open ${formatLocalDateTime(new Date(opensAt).toISOString(), tz)}, 24 hours before the first session. Here is what the model thinks so far.` : locked ? "Predictions are closed for this race." : `The podium is required; everything else is optional.${raceClose ? ` Locks at lights out, ${raceClose}.` : ""}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p role="status" className={`min-w-0 text-body-sm ${message?.tone === "error" ? "text-danger" : "text-success"}`}>
            {message?.text}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="md" onClick={onClose}>
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
        <div className="space-y-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="block" className="h-20" />
          ))}
        </div>
      ) : (
        <div>
          <Category
            title="Podium"
            points="3 per exact place · 1 on the podium"
            model={modelList(model.podium) ? <>Model: {modelList(model.podium)}{model.winnerChance !== null ? ` · ${Math.round(model.winnerChance * 100)}% to win` : ""}</> : "The model publishes after qualifying."}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {(["P1", "P2", "P3"] as const).map((slot, i) => (
                <label key={slot} className="text-caption text-secondary">
                  {slot}
                  <DriverPicker
                    drivers={drivers}
                    value={form.podium[i]}
                    disabled={locked}
                    ariaLabel={`Podium ${slot}`}
                    className="mt-1"
                    onChange={(code) => setForm((f) => ({ ...f, podium: f.podium.map((c, j) => (j === i ? code : c)) as Form["podium"] }))}
                  />
                </label>
              ))}
            </div>
          </Category>

          <Category
            title="Pole position"
            points="3 if right"
            model={model.pole ? <>Model: {nameOf(model.pole)} on pole</> : "The pole model publishes before qualifying."}
            locked={poleLocked && !locked ? "Qualifying has started, so your pole pick is locked." : !poleLocked && qualiClose ? null : null}
          >
            <DriverPicker drivers={drivers} value={form.pole} disabled={poleLocked} ariaLabel="Pole position" onChange={(code) => setForm((f) => ({ ...f, pole: code }))} />
            {!poleLocked && qualiClose && <p className="mt-1.5 text-caption text-tertiary">Locks when qualifying starts, {qualiClose}.</p>}
          </Category>

          <Category title="Fastest lap" points="2 if right" model={model.fastestLap ? <>Model: {nameOf(model.fastestLap)} has the best race pace</> : "The pace model publishes after practice."}>
            <DriverPicker drivers={drivers} value={form.fastestLap} disabled={locked} ariaLabel="Fastest lap" onChange={(code) => setForm((f) => ({ ...f, fastestLap: code }))} />
          </Category>

          <Category title="Top five" points="1 per driver in the top five, any order" model={modelList(model.top5) ? <>Model: {modelList(model.top5)}</> : "The model publishes after qualifying."}>
            <div className="grid gap-3 sm:grid-cols-5">
              {form.top5.map((code, i) => (
                <DriverPicker key={i} drivers={drivers} value={code} disabled={locked} placeholder={`#${i + 1}`} ariaLabel={`Top five, driver ${i + 1}`} onChange={(c) => setTop5(i, c)} />
              ))}
            </div>
          </Category>

          <Category title="Safety car" points="2 if right" model={<>Model: {Math.round(model.safetyCar * 100)}% chance of at least one</>}>
            <Segmented
              label="Safety car"
              value={form.safetyCar}
              disabled={locked}
              onChange={(v) => setForm((f) => ({ ...f, safetyCar: v }))}
              options={[
                { value: true, label: "Yes, at least one" },
                { value: false, label: "No safety car" },
              ]}
            />
          </Category>

          <Category title="Winning margin" points="2 if right" model="No model pick: the models predict pace, not gaps. Your call.">
            <Segmented
              label="Winning margin"
              value={form.margin}
              disabled={locked}
              onChange={(v) => setForm((f) => ({ ...f, margin: v }))}
              options={MARGIN_BUCKETS.map((b) => ({ value: b, label: MARGIN_LABEL[b] }))}
            />
          </Category>
        </div>
      )}
    </Dialog>
  );
}
