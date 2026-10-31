"use client";

import { Activity, Check, Copy, Disc, Sparkles } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { F1DataCard, StintDataCard, TelemetryDataCard, WinProbabilityDataCard } from "@/lib/communities";
import { teamColor } from "@/lib/teamColors";

const PIRELLI_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SOFT: { bg: "#e8002d", text: "#ffffff", label: "Soft" },
  MEDIUM: { bg: "#ffcc00", text: "#111111", label: "Medium" },
  HARD: { bg: "#ffffff", text: "#111111", label: "Hard" },
  INTERMEDIATE: { bg: "#43b02a", text: "#ffffff", label: "Inter" },
  WET: { bg: "#2293d1", text: "#ffffff", label: "Wet" },
};

function compoundBadge(compound: string) {
  const norm = compound.toUpperCase();
  const spec = PIRELLI_COLORS[norm] ?? { bg: "#888888", text: "#ffffff", label: compound };
  return spec;
}

export function F1DataCardEmbed({
  dataCard,
  className = "",
}: {
  dataCard: F1DataCard;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copyCitation(e: React.MouseEvent) {
    e.stopPropagation();
    let text = "";
    if (dataCard.kind === "telemetry") {
      text = `[F1 Telemetry] ${dataCard.raceName} ${dataCard.session}: ${dataCard.driver1.code} vs ${dataCard.driver2.code} (Delta: ${dataCard.deltaSeconds > 0 ? "+" : ""}${dataCard.deltaSeconds.toFixed(3)}s)`;
    } else if (dataCard.kind === "stint") {
      text = `[F1 Tire Strategy] ${dataCard.raceName}: ${dataCard.driver.name} (${dataCard.stints.map((s) => `${s.compound} L${s.startLap}-${s.endLap}`).join(" → ")})`;
    } else if (dataCard.kind === "win_probability") {
      text = `[Apex Simulation] ${dataCard.raceName}: ${dataCard.leader.name} favourite at ${Math.round(dataCard.leader.winProb * 100)}% win chance`;
    }
    if (text) {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      role="region"
      aria-label={`F1 Data Card: ${dataCard.raceName}`}
      className={`my-3 overflow-hidden rounded-card border border-white/12 bg-surface-1/95 p-3.5 shadow-sm transition-all duration-fast hover:border-white/20 ${className}`}
    >
      {dataCard.kind === "telemetry" && <TelemetryCardView card={dataCard} onCopy={copyCitation} copied={copied} />}
      {dataCard.kind === "stint" && <StintCardView card={dataCard} onCopy={copyCitation} copied={copied} />}
      {dataCard.kind === "win_probability" && <WinProbCardView card={dataCard} onCopy={copyCitation} copied={copied} />}
    </div>
  );
}

function CardHeader({
  icon: IconComponent,
  category,
  title,
  subtitle,
  onCopy,
  copied,
}: {
  icon: typeof Activity;
  category: string;
  title: string;
  subtitle?: string;
  onCopy: (e: React.MouseEvent) => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-control bg-white/[0.06] text-secondary">
          <Icon icon={IconComponent} size={16} className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-caption font-bold uppercase tracking-wider text-tertiary">{category}</span>
            <span className="text-tertiary">·</span>
            <span className="truncate text-caption font-semibold text-primary">{title}</span>
          </div>
          {subtitle && <p className="truncate text-caption text-secondary">{subtitle}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        title="Copy citation"
        aria-label="Copy citation"
        className="flex shrink-0 items-center gap-1 rounded-control bg-white/[0.04] px-2 py-1 text-caption text-tertiary transition-colors hover:bg-white/[0.08] hover:text-primary"
      >
        <Icon icon={copied ? Check : Copy} size={16} className={`size-3 ${copied ? "text-success" : ""}`} />
        <span>{copied ? "Copied" : "Cite"}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- 1. Telemetry Delta Card

function TelemetryCardView({
  card,
  onCopy,
  copied,
}: {
  card: TelemetryDataCard;
  onCopy: (e: React.MouseEvent) => void;
  copied: boolean;
}) {
  const d1Color = teamColor(card.driver1.team);
  const d2Color = teamColor(card.driver2.team);
  const d1Faster = card.deltaSeconds <= 0;
  const absDelta = Math.abs(card.deltaSeconds).toFixed(3);

  // Calculate ratio for visual balance bar
  const d1Share = d1Faster ? 0.65 : 0.35;

  return (
    <div>
      <CardHeader
        icon={Activity}
        category="Telemetry Delta"
        title={card.raceName}
        subtitle={`${card.session}${card.circuit ? ` · ${card.circuit}` : ""}`}
        onCopy={onCopy}
        copied={copied}
      />

      <div className="mt-3 grid grid-cols-2 gap-3 items-center">
        {/* Driver 1 */}
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: d1Color }} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-body-sm font-bold text-primary">{card.driver1.code}</span>
              <span className="truncate text-caption text-tertiary">{card.driver1.team}</span>
            </div>
            {card.driver1.lapTime && <p className="font-mono text-caption text-secondary">{card.driver1.lapTime}</p>}
          </div>
        </div>

        {/* Driver 2 */}
        <div className="flex items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <div className="flex items-baseline justify-end gap-1">
              <span className="truncate text-caption text-tertiary">{card.driver2.team}</span>
              <span className="font-mono text-body-sm font-bold text-primary">{card.driver2.code}</span>
            </div>
            {card.driver2.lapTime && <p className="font-mono text-caption text-secondary">{card.driver2.lapTime}</p>}
          </div>
          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: d2Color }} />
        </div>
      </div>

      {/* Delta Badge & Visual Split Bar */}
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between text-caption text-tertiary mb-1">
          <span className={d1Faster ? "font-semibold text-emerald-400" : ""}>
            {d1Faster ? `-${absDelta}s (${card.driver1.code})` : ""}
          </span>
          <span className="font-mono font-medium text-secondary">Δ {absDelta}s</span>
          <span className={!d1Faster ? "font-semibold text-emerald-400" : ""}>
            {!d1Faster ? `-${absDelta}s (${card.driver2.code})` : ""}
          </span>
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full transition-all duration-slow"
            style={{
              width: `${d1Share * 100}%`,
              backgroundColor: d1Color,
            }}
          />
          <div
            className="h-full flex-1 transition-all duration-slow"
            style={{
              backgroundColor: d2Color,
            }}
          />
        </div>
      </div>

      {/* Sectors and Speed Trap */}
      {(card.sectorDeltas || card.speedTrap) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-caption">
          {card.sectorDeltas && (
            <div className="flex items-center gap-1.5">
              <span className="text-caption uppercase font-bold text-tertiary">Sectors:</span>
              {card.sectorDeltas.map((s, idx) => {
                const sFaster = s <= 0;
                return (
                  <span
                    key={idx}
                    className={`rounded px-1.5 py-0.5 font-mono text-caption ${
                      sFaster ? "bg-emerald-500/10 text-emerald-400 font-medium" : "bg-white/[0.05] text-tertiary"
                    }`}
                  >
                    S{idx + 1} {s > 0 ? `+${s.toFixed(3)}` : s.toFixed(3)}
                  </span>
                );
              })}
            </div>
          )}

          {card.speedTrap && (
            <div className="flex items-center gap-1.5 font-mono text-caption text-tertiary">
              <span className="text-caption uppercase font-bold">Trap:</span>
              <span className="text-secondary">{card.speedTrap.driver1Speed} km/h</span>
              <span>vs</span>
              <span className="text-secondary">{card.speedTrap.driver2Speed} km/h</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 2. Stint Timeline Card

function StintCardView({
  card,
  onCopy,
  copied,
}: {
  card: StintDataCard;
  onCopy: (e: React.MouseEvent) => void;
  copied: boolean;
}) {
  const totalLaps = card.totalLaps > 0 ? card.totalLaps : card.stints.reduce((sum, s) => sum + s.laps, 0);

  return (
    <div>
      <CardHeader
        icon={Disc}
        category="Tire Stint Strategy"
        title={card.raceName}
        subtitle={`${card.driver.name} (${card.driver.code}) · ${totalLaps} Total Laps`}
        onCopy={onCopy}
        copied={copied}
      />

      {/* Visual Stint Bar */}
      <div className="mt-3">
        <div className="flex h-3 w-full overflow-hidden rounded-control bg-white/[0.06] p-0.5 gap-0.5">
          {card.stints.map((stint, idx) => {
            const spec = compoundBadge(stint.compound);
            const pct = Math.max(5, (stint.laps / totalLaps) * 100);
            return (
              <div
                key={idx}
                title={`${spec.label}: ${stint.laps} laps (L${stint.startLap}–L${stint.endLap})`}
                className="h-full rounded-[2px] transition-all hover:brightness-110"
                style={{ width: `${pct}%`, backgroundColor: spec.bg }}
              />
            );
          })}
        </div>
      </div>

      {/* Stints Legend / List */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {card.stints.map((stint, idx) => {
          const spec = compoundBadge(stint.compound);
          return (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded-control border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-caption"
            >
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: spec.bg }} />
              <span className="font-semibold text-primary">{spec.label}</span>
              <span className="text-secondary tabular font-mono">
                {stint.laps}L <span className="text-tertiary">({stint.startLap}–{stint.endLap})</span>
              </span>
              {stint.isNew && <span className="text-caption font-bold text-success uppercase">New</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3. Win Probability Card

function WinProbCardView({
  card,
  onCopy,
  copied,
}: {
  card: WinProbabilityDataCard;
  onCopy: (e: React.MouseEvent) => void;
  copied: boolean;
}) {
  const leaderColor = teamColor(card.leader.team);
  const winPct = Math.round(card.leader.winProb * 100);
  const podiumPct = Math.round(card.leader.podiumProb * 100);

  return (
    <div>
      <CardHeader
        icon={Sparkles}
        category="Apex Simulation Outlook"
        title={card.raceName}
        subtitle={`Monte Carlo Model (${card.simulationsCount.toLocaleString()} simulations)`}
        onCopy={onCopy}
        copied={copied}
      />

      {card.headline && (
        <p className="mt-2 text-caption italic text-secondary leading-snug">{card.headline}</p>
      )}

      {/* Favorite Driver Highlight */}
      <div className="mt-3 rounded-control border border-white/[0.08] bg-white/[0.02] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: leaderColor }} />
            <div className="min-w-0">
              <span className="text-caption font-bold text-primary">{card.leader.name}</span>
              <span className="text-caption text-tertiary ml-1.5">Favorite</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-title-sm font-bold tabular text-brand">{winPct}%</span>
            <span className="text-caption text-tertiary">Win</span>
            <span className="text-caption font-medium tabular text-secondary ml-1.5">{podiumPct}%</span>
            <span className="text-caption text-tertiary">Podium</span>
          </div>
        </div>

        {/* Win Progress Meter */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full bg-brand transition-all duration-slow"
            style={{ width: `${winPct}%` }}
          />
        </div>
      </div>

      {/* Contenders List */}
      {card.contenders.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {card.contenders.map((c) => {
            const cColor = teamColor(c.team);
            const cWin = Math.round(c.winProb * 100);
            return (
              <div key={c.code} className="flex items-center justify-between text-caption px-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: cColor }} />
                  <span className="font-medium text-secondary truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 tabular text-tertiary text-caption">
                  <span className="w-16 bg-white/[0.06] h-1 rounded-full overflow-hidden">
                    <span className="block h-full bg-white/40" style={{ width: `${cWin}%` }} />
                  </span>
                  <span className="w-8 text-right font-mono font-medium text-secondary">{cWin}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
