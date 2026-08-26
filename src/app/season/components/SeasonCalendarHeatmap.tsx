"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { staggerItem } from "@/components/motion/variants";
import { tableToCanvas } from "@/lib/export";
import { raceHref } from "@/lib/routes";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { Top3ByRound } from "../services/season.service";

const CALENDAR_COLUMNS = ["Round", "Event", "Session", "Date"];

type SessionCategory = "practice" | "qualifying" | "sprintQualifying" | "sprint" | "race";

type CellEvent = { category: SessionCategory; label: string; raceName: string; href: string; topFinishers?: string[] };

type DayCell = { date: Date; inYear: boolean; events: CellEvent[] };

const CATEGORY_META: Record<SessionCategory, { label: string; color: string }> = {
  practice: { label: "Practice", color: "#60a5fa" },
  qualifying: { label: "Qualifying", color: "#f59e0b" },
  sprintQualifying: { label: "Sprint Qualifying", color: "#2dd4bf" },
  sprint: { label: "Sprint", color: "#a78bfa" },
  race: { label: "Race", color: "var(--f1-red)" },
};
// Most-significant-first — a day with more than one session (sprint weekends stack several onto
// one Saturday) picks its cell color by whichever event on it matters most, not array order.
const CATEGORY_PRIORITY: SessionCategory[] = ["race", "sprint", "sprintQualifying", "qualifying", "practice"];

function categorize(label: string): SessionCategory {
  const l = label.toLowerCase();
  if (l.includes("sprint") && l.includes("qualifying")) return "sprintQualifying";
  if (l.includes("sprint")) return "sprint";
  if (l.includes("practice")) return "practice";
  if (l.includes("qualifying")) return "qualifying";
  return "race";
}

// No dedicated qualifying/practice routes exist (see src/app/races/page.tsx) — a `?section=`
// query param onto that same round's page (scrolled to by ScrollToSection) is the whole mechanism.
function sessionHref(year: number, round: number, category: SessionCategory): string {
  if (category === "qualifying" || category === "sprintQualifying") return raceHref(year, round, "qualifying");
  if (category === "practice") return raceHref(year, round, "practice");
  return raceHref(year, round);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/** A GitHub/LeetCode-contributions-style year grid: one column per week, one row per weekday,
 * colored by session type (practice/qualifying/sprint quali/sprint/race) rather than intensity.
 * Deliberately the full calendar year (Jan 1 - Dec 31), not just the season's active months — a
 * season's ~24 rounds against 365 days is exactly the sparse, mostly-empty look the reference
 * (GitHub's contribution graph) has. */
export function SeasonCalendarHeatmap({
  year,
  entries,
  top3ByRound,
}: {
  year: number;
  entries: CalendarEntry[];
  top3ByRound: Top3ByRound;
}) {
  const [hovered, setHovered] = useState<{ cell: DayCell; x: number; y: number } | null>(null);
  const scrollRef = useNestedLenisScroll(year, { orientation: "horizontal", gestureOrientation: "horizontal" });

  const { weeks, monthLabelForWeek } = useMemo(() => {
    const eventsByDate = new Map<string, CellEvent[]>();
    for (const entry of entries) {
      for (const session of entry.sessions) {
        const key = dateKey(new Date(session.date));
        const category = categorize(session.label);
        const list = eventsByDate.get(key) ?? [];
        list.push({
          category,
          label: session.label,
          raceName: entry.name ?? `Round ${entry.round}`,
          href: sessionHref(year, entry.round, category),
          // Only a real race that's already been run has this — a future date, or a session
          // whose race hasn't happened yet, just won't find anything in top3ByRound.
          topFinishers: category === "race" ? top3ByRound[entry.round] : undefined,
        });
        eventsByDate.set(key, list);
      }
    }
    for (const list of eventsByDate.values()) {
      list.sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category));
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const gridStart = new Date(start);
    gridStart.setUTCDate(gridStart.getUTCDate() - start.getUTCDay());
    const end = new Date(Date.UTC(year, 11, 31));
    const gridEnd = new Date(end);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - end.getUTCDay()));

    const weeks: DayCell[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const week: DayCell[] = [];
      for (let i = 0; i < 7; i++) {
        week.push({ date: new Date(cursor), inYear: cursor.getUTCFullYear() === year, events: eventsByDate.get(dateKey(cursor)) ?? [] });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      weeks.push(week);
    }

    // One label per calendar month, placed on the first week-column that contains that month's
    // first few days — not every week, or most columns would repeat the same label.
    let lastMonth = -1;
    const monthLabelForWeek = weeks.map((week) => {
      const firstOfMonth = week.find((d) => d.inYear && d.date.getUTCDate() <= 7);
      if (firstOfMonth && firstOfMonth.date.getUTCMonth() !== lastMonth) {
        lastMonth = firstOfMonth.date.getUTCMonth();
        return MONTH_LABELS[lastMonth];
      }
      return null;
    });

    return { weeks, monthLabelForWeek };
  }, [year, entries, top3ByRound]);

  const calendarRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: CALENDAR_COLUMNS,
    rows: entries.flatMap((entry) =>
      entry.sessions.map((s) => [entry.round, entry.name ?? `Round ${entry.round}`, s.label, new Date(s.date).toLocaleDateString()]),
    ),
  });

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={staggerItem}
      className="glass rounded-xl border border-[var(--f1-line)] p-4 sm:p-6"
    >
      <div className="mb-3 flex items-center justify-end">
        <ExportMenu
          filename={`${year}-calendar`}
          getRows={calendarRows}
          getImage={async () => tableToCanvas(calendarRows().columns, calendarRows().rows)}
        />
      </div>
      <div ref={scrollRef} className="overflow-x-auto scrollbar-hide">
        <div className="inline-flex flex-col gap-1">
          <div className="ml-8 flex gap-[3px]">
            {weeks.map((_, i) => (
              <div key={i} className="w-[13px] shrink-0 text-[10px] text-neutral-600">
                {monthLabelForWeek[i]}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="mr-2 flex w-6 shrink-0 flex-col gap-[3px] text-[10px] text-neutral-600">
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={i} className="h-[13px] leading-[13px]">
                  {label}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => {
                  if (!day.inYear) return <div key={di} className="h-[13px] w-[13px]" />;
                  const primary = day.events[0];
                  const cellClass = "block h-[13px] w-[13px] rounded-[3px] transition hover:ring-1 hover:ring-white/60";
                  // "No session" cells stay neutral (--f1-carbon-2, not --f1-line) — --f1-line is
                  // now a deliberately red-tinted stroke color, wrong semantics for "nothing here".
                  const style = { backgroundColor: primary ? CATEGORY_META[primary.category].color : "var(--f1-carbon-2)", opacity: primary ? 1 : 0.6 };
                  const handlers = {
                    onMouseEnter: (e: React.MouseEvent) => setHovered({ cell: day, x: e.clientX, y: e.clientY }),
                    onMouseMove: (e: React.MouseEvent) => setHovered({ cell: day, x: e.clientX, y: e.clientY }),
                    onMouseLeave: () => setHovered(null),
                  };
                  return primary ? (
                    <Link key={di} href={primary.href} className={cellClass} style={style} {...handlers} />
                  ) : (
                    <div key={di} className={cellClass} style={style} {...handlers} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5">
          <span className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: "var(--f1-carbon-2)", opacity: 0.6 }} />
          No session
        </span>
        {(Object.keys(CATEGORY_META) as SessionCategory[]).map((cat) => (
          <span key={cat} className="flex items-center gap-1.5">
            <span className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: CATEGORY_META[cat].color }} />
            {CATEGORY_META[cat].label}
          </span>
        ))}
      </div>

      {hovered && hovered.cell.events.length > 0 && (
        <div
          className="glass-strong pointer-events-none fixed z-50 max-w-xs rounded-lg border border-[var(--f1-line)] px-3 py-2 text-xs shadow-lg"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          <p className="font-semibold text-neutral-900">{hovered.cell.events[0].raceName}</p>
          {hovered.cell.events.map((e, i) =>
            e.topFinishers?.length ? (
              // A race that's already happened — show who actually won, not just "Race".
              <ol key={i} className="mt-1 list-decimal space-y-0.5 pl-4 text-neutral-700">
                {e.topFinishers.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ol>
            ) : (
              <p key={i} className="text-neutral-600">
                {e.label}
              </p>
            ),
          )}
          <p className="mt-1 text-neutral-600">
            {hovered.cell.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
      )}
    </motion.div>
  );
}
