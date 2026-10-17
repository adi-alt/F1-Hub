"use client";

import { Minus, Plus, Target, X } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatLocalTime, formatLocalWeekday } from "@/lib/countdown";
import { callSession, describeCall, parseCall, type CallKind } from "@/lib/postCalls";
import type { CallableRace } from "@/lib/supabase/postCalls";

export type CallDraft = { kind: CallKind; driver: string | null; rival: string | null; threshold: number | null };

const KINDS: { kind: CallKind; label: string }[] = [
  { kind: "winner", label: "Wins" },
  { kind: "podium", label: "Podium" },
  { kind: "pole", label: "Pole" },
  { kind: "fastest_lap", label: "Fastest lap" },
  { kind: "beats_teammate", label: "Beats" },
  { kind: "safety_car", label: "Safety car" },
  { kind: "retirements", label: "Retirements" },
];

/** Whether a draft is a complete, valid call for this race's roster (the server checks again). */
export function isCompleteCall(draft: CallDraft | null, race: CallableRace): boolean {
  if (!draft) return false;
  return !("error" in parseCall(draft, new Set(race.drivers.map((d) => d.code))));
}

/**
 * "Make a call", inside the composer: a claim about this weekend's race that the app grades against the official
 * result (takes with receipts). Pick what you're calling, then the driver (and a rival, or a number); the sentence
 * and when it locks show underneath. Pole locks at qualifying, the rest at lights out; a kind whose session has
 * already started can't be picked.
 */
export function CallBuilder({ race, value, onChange, onRemove }: { race: CallableRace; value: CallDraft | null; onChange: (draft: CallDraft) => void; onRemove: () => void }) {
  const now = useMinuteClock();
  const tz = useViewerTimeZone();
  const drivers = race.drivers.map((d) => ({ code: d.code, name: d.name, team: d.team }));
  const nameOf = (code: string) => drivers.find((d) => d.code === code)?.name.split(" ").slice(-1)[0] ?? code;
  const lockOf = (kind: CallKind) => race.locks[callSession(kind)];
  const isLocked = (kind: CallKind) => {
    const at = lockOf(kind);
    return !at || Date.parse(at) <= now;
  };
  const teammateOf = (code: string | null) => {
    const team = drivers.find((d) => d.code === code)?.team;
    return drivers.find((d) => d.team === team && d.code !== code)?.code ?? null;
  };

  const pick = (kind: CallKind) =>
    onChange({
      kind,
      driver: kind === "safety_car" || kind === "retirements" ? null : (value?.driver ?? null),
      rival: kind === "beats_teammate" ? (value?.rival ?? teammateOf(value?.driver ?? null)) : null,
      threshold: kind === "retirements" ? (value?.threshold ?? 2) : null,
    });
  const complete = isCompleteCall(value, race);
  const lock = value ? lockOf(value.kind) : null;

  return (
    <div className="mt-2 rounded-control border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <Icon icon={Target} size={16} className="size-3.5 text-tertiary" />
        <p className="min-w-0 flex-1 truncate text-caption text-secondary">
          Make a call on the <span className="font-medium text-primary">{race.raceName}</span>, graded against the official result
        </p>
        <button type="button" onClick={onRemove} aria-label="Remove the call" title="Remove the call" className="flex size-6 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors duration-fast hover:bg-white/[0.07] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          <Icon icon={X} size={16} className="size-3.5" />
        </button>
      </div>

      <div role="radiogroup" aria-label="What you're calling" className="mt-2 flex flex-wrap gap-1.5">
        {KINDS.map(({ kind, label }) => {
          const locked = isLocked(kind);
          const on = value?.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked}
              title={locked ? "That session has started" : undefined}
              onClick={() => pick(kind)}
              className={`h-7 rounded-full px-2.5 text-caption font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "bg-white/[0.14] text-primary ring-1 ring-inset ring-white/40" : "bg-white/[0.04] text-secondary hover:bg-white/[0.08] hover:text-primary"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {value && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {value.kind !== "safety_car" && value.kind !== "retirements" && (
            <div className="w-44">
              <DriverPicker
                drivers={drivers}
                value={value.driver ?? ""}
                ariaLabel="Driver"
                onChange={(code) => onChange({ ...value, driver: code || null, rival: value.kind === "beats_teammate" ? (value.rival && value.rival !== code ? value.rival : teammateOf(code)) : null })}
              />
            </div>
          )}
          {value.kind === "beats_teammate" && (
            <>
              <span className="text-caption text-tertiary">beats</span>
              <div className="w-44">
                <DriverPicker drivers={drivers.filter((d) => d.code !== value.driver)} value={value.rival ?? ""} ariaLabel="Rival" onChange={(code) => onChange({ ...value, rival: code || null })} />
              </div>
            </>
          )}
          {value.kind === "retirements" && (
            <div className="flex items-center gap-1.5">
              <span className="text-caption text-secondary">At least</span>
              <button type="button" aria-label="Fewer" disabled={(value.threshold ?? 1) <= 1} onClick={() => onChange({ ...value, threshold: Math.max(1, (value.threshold ?? 1) - 1) })} className="flex size-7 items-center justify-center rounded-full bg-white/[0.05] text-secondary transition-colors duration-fast hover:bg-white/[0.09] hover:text-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                <Icon icon={Minus} size={16} className="size-3.5" />
              </button>
              <span className="w-5 text-center text-body-sm font-semibold tabular text-primary">{value.threshold ?? 1}</span>
              <button type="button" aria-label="More" disabled={(value.threshold ?? 1) >= 10} onClick={() => onChange({ ...value, threshold: Math.min(10, (value.threshold ?? 1) + 1) })} className="flex size-7 items-center justify-center rounded-full bg-white/[0.05] text-secondary transition-colors duration-fast hover:bg-white/[0.09] hover:text-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                <Icon icon={Plus} size={16} className="size-3.5" />
              </button>
              <span className="text-caption text-secondary">retirements</span>
            </div>
          )}
        </div>
      )}

      {value && (
        <p suppressHydrationWarning className="mt-2 text-caption text-secondary">
          {complete ? (
            <>
              <span className="font-medium text-primary">{describeCall(value, nameOf)}</span>
              {lock && ` · locks ${formatLocalWeekday(lock, tz)} ${formatLocalTime(lock, tz, false)}`}
            </>
          ) : (
            "Choose who you're calling."
          )}
        </p>
      )}
    </div>
  );
}
