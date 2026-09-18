"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAnchoredPanel } from "./usePanelDirection";

/**
 * The scheduling control, ported from the Nexus internal platform's forum composer so the two
 * products schedule a post the same way: a caret beside Post opens a panel with a date and a time
 * field, four quick options, and a Schedule action; once set, the control collapses to a chip
 * showing the chosen moment with an X to clear it.
 *
 * Two deliberate differences from the original, both fixing things this app has already been bitten
 * by:
 *  - it is portaled and collision-aware (useAnchoredPanel) rather than hard-pinned to `bottom-full`.
 *    This composer sits at the TOP of a scrolling column, so a panel pinned upward opens clipped
 *    against the header - the exact bug the emoji and GIF pickers had.
 *  - a past date is refused inline instead of through `alert()`.
 *
 * The value handed up is a `datetime-local`-shaped string (wall clock in the viewer's own zone),
 * which is what PostComposer already converts to a real UTC instant at submit.
 */
export function SchedulePost({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [time, setTime] = useState(() => toTimeInput(addMinutes(new Date(), 30)));
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const style = useAnchoredPanel(triggerRef, 320, 420);

  const quickOptions = [
    { label: "Tomorrow morning", date: atTime(addDays(new Date(), 1), 9, 0) },
    { label: "Tomorrow afternoon", date: atTime(addDays(new Date(), 1), 14, 0) },
    { label: "Monday morning", date: nextDayOfWeek(1, 9, 0) },
    { label: "Next week", date: addDays(new Date(), 7) },
  ];

  function commit(when: Date) {
    onChange(`${toDateInput(when)}T${toTimeInput(when)}`);
    setError("");
    setOpen(false);
  }

  function schedule() {
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) {
      setError("That isn't a valid date and time.");
      return;
    }
    if (when <= new Date()) {
      setError("Pick a time in the future.");
      return;
    }
    commit(when);
  }

  // Scheduled: the caret is replaced by the chosen moment, so the composer states what will happen
  // rather than leaving it behind a menu.
  if (value) {
    const when = new Date(value);
    return (
      <span className="flex h-[30px] items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2 text-[11.5px] text-neutral-200">
        <ClockIcon />
        <span className="whitespace-nowrap tabular-nums">{when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        <button type="button" onClick={() => onChange("")} title="Cancel scheduling" aria-label="Cancel scheduling" className="ml-0.5 text-neutral-500 transition hover:text-white">
          <CloseIcon />
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Schedule this post"
        title="Schedule this post"
        className="flex items-center border-l border-black/20 bg-[var(--f1-red)] px-2 text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
      >
        <svg viewBox="0 0 10 10" width="9" height="9" fill="none" aria-hidden className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open &&
          style &&
          typeof document !== "undefined" &&
          createPortal(
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={style}
              className="overflow-y-auto rounded-lg border border-[var(--f1-line)] bg-[var(--tooltip-surface-strong)] shadow-2xl backdrop-blur-md scrollbar-hide"
            >
              <div className="relative p-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close scheduling"
                  aria-label="Close scheduling"
                  className="absolute right-3 top-3 text-neutral-500 transition hover:text-white"
                >
                  <CloseIcon size={16} />
                </button>

                <h3 className="mb-4 flex items-center gap-2 pr-6 text-[13px] font-semibold text-white">
                  <ClockIcon />
                  Schedule post
                </h3>

                <div className="mb-4 flex gap-3">
                  <label className="flex-1">
                    <span className="mb-2 flex items-center gap-2 text-[11.5px] text-neutral-400">
                      <CalendarIcon />
                      Date
                    </span>
                    <input
                      type="date"
                      value={date}
                      min={toDateInput(new Date())}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.09] bg-black/30 px-3 py-2 text-[13px] text-white transition-colors focus:border-white/25 focus:outline-none"
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-2 flex items-center gap-2 text-[11.5px] text-neutral-400">
                      <ClockIcon />
                      Time
                    </span>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.09] bg-black/30 px-3 py-2 text-[13px] text-white transition-colors focus:border-white/25 focus:outline-none"
                    />
                  </label>
                </div>

                <div className="mb-4 space-y-2">
                  <p className="mb-2 text-[11.5px] text-neutral-400">Quick options</p>
                  {quickOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => commit(option.date)}
                      className="w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-left text-[12.5px] text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span className="block font-medium">{option.label}</span>
                      <span className="mt-1 block text-[11px] text-neutral-500">
                        {option.date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </button>
                  ))}
                </div>

                {error && <p className="mb-3 text-[11.5px] text-[var(--f1-red)]">{error}</p>}

                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10.5px] text-neutral-500">{localZone()}</span>
                  <button
                    type="button"
                    onClick={schedule}
                    className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.1]"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            </motion.div>,
            document.body,
          )}
      </AnimatePresence>
    </>
  );
}

/** Local wall-clock date, NOT toISOString() - the original used the ISO form, which is UTC and so
 * picks the wrong day for anyone east or west of it near midnight. */
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function atTime(d: Date, hours: number, minutes: number): Date {
  const out = new Date(d);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

/** The next occurrence of a weekday, always in the future - if today already is that weekday and
 * the time has passed, it rolls to next week rather than offering a moment already gone. */
function nextDayOfWeek(dayOfWeek: number, hours: number, minutes: number): Date {
  const out = new Date();
  out.setDate(out.getDate() + ((dayOfWeek + 7 - out.getDay()) % 7));
  out.setHours(hours, minutes, 0, 0);
  if (out <= new Date()) out.setDate(out.getDate() + 7);
  return out;
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local time";
  } catch {
    return "local time";
  }
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 18 18" width="14" height="14" fill="none" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.4V9l2.4 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden className="shrink-0">
      <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.2 6.6h11.6M5.5 2v2.6M10.5 2v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" aria-hidden className="shrink-0">
      <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
