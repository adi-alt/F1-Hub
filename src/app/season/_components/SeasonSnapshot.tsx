"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import type { PersonalSeasonContext, SnapshotItem } from "../_service/season.pure";

/**
 * Four deterministic reads of the season, each one clickable into the thing it describes.
 *
 * The previous version was four labels with four numbers under them - true, but inert, and with
 * no reason for the reader to care about any of it. Every item now carries a deterministic REASON
 * ("largest realistic threat", "closest active rivalry") and a destination, so the strip is a way
 * into the page rather than a summary of it.
 *
 * None of this is model-generated. These are facts plus fixed editorial labels, which is why they
 * can never contradict the standings rendered below them - and why they cost nothing.
 */
export function SeasonSnapshot({ items, personal }: { items: SnapshotItem[]; personal: PersonalSeasonContext }) {
  const { focusEntity, setAnalysisTab, openCompare } = useSeasonExplorer();
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;

  const favoriteIds = new Set<string>([...personal.driverCodes, ...personal.teamNames]);

  function activate(item: SnapshotItem) {
    const target = item.target;
    if (!target) return;
    if (target.kind === "standings") {
      focusEntity(target.entityType, target.entityId);
    } else if (target.kind === "progression") {
      focusEntity(target.entityType, target.entityId);
      setAnalysisTab("progression");
    } else {
      openCompare(target.entityType, target.aId, target.bId);
    }
  }

  return (
    <section aria-label="Season snapshot" className="mb-9">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Season snapshot</p>
      <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />

      {/* `grid-rows-[auto_auto_auto_auto]` on each item, with the items themselves stretched, is
          what keeps label/name/value/reason on four shared baselines across all four columns -
          a shared min-height only equalises the box, not the lines inside it. */}
      <div className="mt-1 grid grid-cols-2 items-stretch sm:grid-cols-4">
        {items.map((item, i) => {
          const isFavorite = item.entityIds.some((id) => favoriteIds.has(id));
          return (
            <motion.button
              key={item.key}
              type="button"
              onClick={() => activate(item)}
              // The whole item is one target rather than a small link inside it - these are
              // finger-sized on a phone by construction, not by adding padding to an icon.
              className="group relative grid grid-rows-[auto_auto_auto_auto] content-start gap-y-1 rounded-[3px] px-0 py-3.5 text-left transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] sm:px-4 sm:first:pl-0"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: reduceMotion ? 0 : i * 0.04, ease: "easeOut" }}
            >
              {/* A hairline divider between columns instead of four bordered cards. */}
              {i > 0 && <span aria-hidden className="absolute inset-y-3 left-0 hidden w-px bg-white/[0.06] sm:block" />}

              <span className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{item.label}</span>
                {isFavorite && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]"
                    title="One of your favorites"
                    aria-label="One of your favorites"
                  />
                )}
              </span>

              <span className="block truncate text-[15px] font-semibold leading-tight text-white">{item.name}</span>
              <span className="block truncate font-mono text-xs leading-tight tabular-nums text-neutral-400">{item.value ?? "\u00a0"}</span>
              <span className="block truncate text-[11px] leading-tight text-neutral-600 transition-colors group-hover:text-neutral-400">{item.reason}</span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
