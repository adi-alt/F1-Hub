"use client";

import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { AnalysisEmptyState } from "./AnalysisEmptyState";
import { SeasonInsight, SeasonInsightSkeleton } from "./ai/SeasonInsight";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import { tugPct, type Battle, type PersonalSeasonContext } from "../_service/season.pure";
import { battleId } from "@/lib/ai/context/seasonContext";

/**
 * The season's closest fights.
 *
 * Every row states its metric. That is not decoration: a bar reading "6 vs 6" is genuinely
 * ambiguous between championship points and head-to-head race wins, and the two were previously
 * rendered in the same visual language with no label, so a row could appear to contradict the
 * narrative sitting above it. Points drive the bar; head-to-head is carried as separate,
 * explicitly-labelled metadata underneath — never merged into the same comparison.
 *
 * "Tied" alone is likewise gone. A tie has to say what is tied.
 */
export function BattlesPanel({ battles, personal }: { battles: Battle[]; personal: PersonalSeasonContext }) {
  const { intelligence, loading } = useSeasonIntelligence();
  const { openCompare } = useSeasonExplorer();
  const reduceMotion = useReducedMotion();

  if (battles.length === 0) return <AnalysisEmptyState>No close battles yet — check back once more rounds are in.</AnalysisEmptyState>;

  const insight = intelligence?.battleInsight;
  // Apex's narrative is anchored to the battle it actually cites, so the highlighted row and the
  // text can't describe different pairs. When the model names no battle, the tightest one (always
  // first) is the honest default, because that's what the copy will be about.
  const highlightedId = insight?.highlightedBattleId ?? (battles[0] ? battleId(battles[0]) : undefined);
  const favoriteIds = new Set<string>([...personal.driverCodes, ...personal.teamNames]);

  return (
    <div>
      {loading ? <SeasonInsightSkeleton label="Loading battle insight" /> : insight && <SeasonInsight eyebrow="Apex on the battles" headline={insight.headline} summary={insight.summary} />}

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Closest battles <span className="font-normal normal-case tracking-normal text-neutral-600">· ranked by championship points gap</span>
      </p>

      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-white/[0.055]">
        {battles.map((b) => {
          const id = battleId(b);
          return (
            <motion.div key={id} variants={reduceMotion ? undefined : staggerItem}>
              <BattleRow
                battle={b}
                isHighlighted={id === highlightedId}
                isFavorite={favoriteIds.has(b.aId) || favoriteIds.has(b.bId)}
                onClick={() => openCompare(b.type, b.aId, b.bId)}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function BattleRow({ battle, isHighlighted, isFavorite, onClick }: { battle: Battle; isHighlighted: boolean; isFavorite: boolean; onClick: () => void }) {
  const [aPct, bPct] = tugPct(battle.aValue, battle.bValue);
  const h2h = battle.h2h;
  const gapLabel = battle.gap === 0 ? "Level on points" : `${battle.gap} pt gap`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${battle.aLabel} ${battle.aValue} ${battle.metricLabel.toLowerCase()} against ${battle.bLabel} ${battle.bValue}. ${gapLabel}. Open in Compare.`}
      className={`group -mx-2 w-full rounded-[3px] border-l-2 px-2 py-3 text-left transition-colors duration-150 hover:bg-white/[0.028] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--f1-red)] ${
        isHighlighted ? "border-l-[var(--f1-red)]" : "border-l-transparent"
      }`}
    >
      <span className="flex items-center gap-2 sm:gap-3">
        <span className="flex w-[4.5rem] shrink-0 items-center justify-end gap-1.5 sm:w-36">
          {isFavorite && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />}
          <span className="truncate text-right text-sm font-medium text-white">{battle.aLabel}</span>
        </span>
        <span className="w-8 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-white">{battle.aValue}</span>

        <span className="flex min-w-[3rem] flex-1 items-center gap-1">
          <span className="flex h-[5px] flex-1 justify-end overflow-hidden rounded-l-full bg-white/[0.06]">
            <motion.span
              className="h-full rounded-l-full"
              initial={false}
              animate={{ width: `${aPct}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ background: "linear-gradient(90deg, rgba(225,6,0,0.5), var(--f1-red))" }}
            />
          </span>
          <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-white/25" />
          <span className="flex h-[5px] flex-1 overflow-hidden rounded-r-full bg-white/[0.06]">
            <motion.span
              className="h-full rounded-r-full"
              initial={false}
              animate={{ width: `${bPct}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.42), rgba(255,255,255,0.14))" }}
            />
          </span>
        </span>

        <span className="w-8 shrink-0 text-left font-mono text-sm tabular-nums text-neutral-300">{battle.bValue}</span>
        <span className="w-[4.5rem] shrink-0 truncate text-sm text-neutral-300 sm:w-36">{battle.bLabel}</span>
      </span>

      {/* The metric the bar above encodes, plus head-to-head as a separate, named statistic. */}
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-600 sm:pl-[10.5rem]">
        <span className={battle.gap === 0 ? "text-neutral-400" : "text-neutral-500"}>
          {gapLabel} <span className="text-neutral-600">· {battle.metricLabel.toLowerCase()}</span>
        </span>
        {h2h && h2h.comparableRounds > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {h2h.aWins}–{h2h.bWins}
              {h2h.ties > 0 ? `–${h2h.ties}` : ""} head-to-head on race classification over {h2h.comparableRounds} round{h2h.comparableRounds === 1 ? "" : "s"}
              {h2h.excludedRounds > 0 ? ` (${h2h.excludedRounds} not comparable)` : ""}
            </span>
          </>
        )}
        {h2h?.isTeammates && (
          <>
            <span aria-hidden>·</span>
            <span>teammates</span>
          </>
        )}
      </span>
    </button>
  );
}
