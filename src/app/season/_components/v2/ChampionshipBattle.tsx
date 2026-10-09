"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section } from "@/components/ui/Section";
import { ensureVisible } from "@/lib/colorContrast";
import { teamColor } from "@/lib/teamColors";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";
import type { EntityType, PersonalSeasonContext, RaceSummary } from "../../_service/season.pure";
import { buildProgression, lastCompletedIndex, lastValue, type Series } from "../../_utils/championship";

type Preset = "top3" | "top5" | "top10" | "favourites";
const MAX_LINES = 10;

/**
 * The page's centrepiece: the championship as it has developed, round by round, from each round's own points.
 * Drivers or constructors (the page-wide switch), the leading group or your favourites, any entity toggled from
 * the legend. Completed rounds are plotted; the rounds still to run sit in a shaded area after the "now" line,
 * so the chart's right edge is the end of the season rather than the last result.
 */
export function ChampionshipBattle({ raceSummaries, personal }: { raceSummaries: RaceSummary[]; personal: PersonalSeasonContext }) {
  const { entityType, setEntityType } = useSeasonExplorer();
  const { rounds, series } = useMemo(() => buildProgression(raceSummaries, entityType), [raceSummaries, entityType]);
  const favourites = useMemo(() => new Set(entityType === "drivers" ? personal.driverCodes : personal.teamNames), [entityType, personal]);
  const [preset, setPreset] = useState<Preset>("top5");
  const [custom, setCustom] = useState<Set<string> | null>(null);

  const presetIds = (p: Preset) =>
    p === "favourites" ? series.filter((s) => favourites.has(s.id)).map((s) => s.id) : series.slice(0, p === "top3" ? 3 : p === "top5" ? 5 : 10).map((s) => s.id);
  const shown = custom ?? new Set(presetIds(preset));
  const visible = series.filter((s) => shown.has(s.id)).slice(0, MAX_LINES);
  const last = lastCompletedIndex(rounds);
  const futureRounds = rounds.filter((r, i) => i > last && !r.cancelled);

  // Teammates share a colour: the second car of a team draws dashed so the two stay distinguishable.
  const style = useMemo(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, { color: string; dash?: string }>();
    for (const s of series) {
      const n = seen.get(s.team) ?? 0;
      seen.set(s.team, n + 1);
      out.set(s.id, { color: ensureVisible(teamColor(s.team)), dash: entityType === "drivers" && n > 0 ? "6 4" : undefined });
    }
    return out;
  }, [series, entityType]);

  // A cancelled round never happened: it has no column, so the lines run straight through it instead of breaking.
  const data = rounds
    .map((r, i) => {
      const row: Record<string, number | string | null> = { x: `R${r.round}`, name: r.name };
      for (const s of visible) row[s.id] = s.points[i];
      return row;
    })
    .filter((_, i) => !rounds[i].cancelled);

  const toggle = (id: string) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_LINES) next.add(id);
    setCustom(next);
  };
  const choosePreset = (p: Preset) => {
    setPreset(p);
    setCustom(null);
  };

  const summary =
    last >= 0 && visible.length
      ? `Points after each round, ${entityType}: ${[...visible].sort((a, b) => lastValue(b) - lastValue(a)).map((s) => `${s.label} ${lastValue(s)}`).join(", ")}, after round ${rounds[last].round} of ${rounds.length}.`
      : "No completed rounds yet.";

  return (
    <Section
      id="championship-battle"
      level={2}
      title="Championship battle"
      description="Points after every round, from each round's own result. Grand Prix points only."
      actions={<EntitySwitch value={entityType} onChange={setEntityType} />}
    >
      <div className="rounded-card bg-surface-1 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
          {(
            [
              ["top3", "Top 3"],
              ["top5", "Top 5"],
              ["top10", "Top 10"],
              ...(favourites.size ? ([["favourites", "Your favourites"]] as const) : []),
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              aria-pressed={!custom && preset === p}
              onClick={() => choosePreset(p as Preset)}
              className={`h-8 rounded-control border px-3 text-body-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${!custom && preset === p ? "border-primary bg-surface-3 text-primary" : "border-subtle text-secondary hover:text-primary"}`}
            >
              {label}
            </button>
          ))}
          {custom && <span className="text-caption text-secondary">Custom selection · tap a name to add or remove</span>}
        </div>

        <figure className="mt-5" aria-label={`Championship progression chart. ${summary}`}>
          <div className="h-80 sm:h-[26rem]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
                <XAxis dataKey="x" tick={{ fill: "var(--text-tertiary)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgb(255 255 255 / 0.12)" }} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
                {last >= 0 && futureRounds.length > 0 && (
                  <ReferenceArea x1={`R${futureRounds[0].round}`} x2={`R${futureRounds[futureRounds.length - 1].round}`} fill="rgb(255 255 255 / 0.03)" stroke="none" label={{ value: "Still to run", fill: "var(--text-tertiary)", fontSize: 12, position: "insideTop" }} />
                )}
                {last >= 0 && <ReferenceLine x={`R${rounds[last].round}`} stroke="var(--brand)" strokeDasharray="3 3" label={{ value: "Now", fill: "var(--brand-text)", fontSize: 12, position: "insideTopRight" }} />}
                <Tooltip content={<BattleTooltip series={visible} styleOf={style} />} cursor={{ stroke: "rgb(255 255 255 / 0.2)" }} />
                {visible.map((s) => {
                  const st = style.get(s.id)!;
                  return <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={st.color} strokeDasharray={st.dash} strokeWidth={favourites.has(s.id) ? 3 : 2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={!prefersReducedMotion()} animationDuration={900} />;
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="sr-only">{summary}</figcaption>
        </figure>

        {/* The legend is the selector: every entity, current points, on or off. */}
        <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${entityType === "drivers" ? "Drivers" : "Constructors"} on the chart`}>
          {series.map((s) => {
            const on = shown.has(s.id);
            const st = style.get(s.id)!;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={`flex h-8 items-center gap-2 rounded-control border px-2.5 text-body-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${on ? "border-subtle bg-surface-2 text-primary" : "border-transparent text-tertiary hover:text-secondary"}`}
                >
                  <svg aria-hidden width="18" height="4" className="shrink-0">
                    <line x1="0" y1="2" x2="18" y2="2" stroke={on ? st.color : "currentColor"} strokeWidth="2.5" strokeDasharray={st.dash ? "4 3" : undefined} strokeLinecap="round" />
                  </svg>
                  {entityType === "drivers" ? s.id : s.label}
                  <span className="tabular text-secondary">{lastValue(s)}</span>
                  {favourites.has(s.id) && <span className="sr-only">(favourite)</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function BattleTooltip({ active, payload, label, series, styleOf }: { active?: boolean; payload?: { dataKey: string; value: number | null; payload: { name: string } }[]; label?: string; series: Series[]; styleOf: Map<string, { color: string }> }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (rows.length === 0) return null;
  const nameOf = (id: string) => series.find((s) => s.id === id)?.label ?? id;
  return (
    <div className="rounded-control bg-surface-3 px-3 py-2 shadow-overlay">
      <p className="text-caption text-secondary">
        {label} · {payload[0].payload.name}
      </p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((p) => (
          <li key={p.dataKey} className="flex items-center justify-between gap-4 text-body-sm">
            <span className="flex items-center gap-2 text-primary">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: styleOf.get(p.dataKey)?.color }} />
              {nameOf(p.dataKey)}
            </span>
            <span className="tabular text-primary">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Drivers or constructors, for the whole page (the standings and insights follow the same switch). */
export function EntitySwitch({ value, onChange }: { value: EntityType; onChange: (v: EntityType) => void }) {
  return (
    <div role="radiogroup" aria-label="Championship" className="flex rounded-control bg-surface-2 p-0.5">
      {(["drivers", "constructors"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-8 rounded-control px-3 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${value === v ? "bg-surface-3 text-primary" : "text-secondary hover:text-primary"}`}
        >
          {v === "drivers" ? "Drivers" : "Constructors"}
        </button>
      ))}
    </div>
  );
}
