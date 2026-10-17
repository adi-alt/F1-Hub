"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Picker } from "@/components/ui/Picker";
import { useAnchoredPanel } from "./usePanelDirection";

/** Minute granularity offered. Five minutes is fine for "publish this post" and keeps the list
 * short enough to scan; per-minute would be 60 rows for no real gain. */
const MINUTE_STEP = 5;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The scheduling control: a caret beside Post opens a panel with a real calendar, a time, and four
 * quick options. Structure follows the Nexus forum composer it was ported from; the date and time
 * fields are this app's own rather than the browser's.
 *
 * Native <input type="date"> and <input type="time"> were the first cut and are gone: they render
 * the OS widget, which brings its own typography, its own locale formatting and its own light
 * popup, so the panel stopped looking like F1 HUB the moment either was focused. The calendar below
 * is a plain month grid, and the time is two of the app's existing Picker dropdowns - both already
 * dark, keyboard-navigable and portal-rendered.
 */
export function SchedulePost({ onChange }: { onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => roundUpToStep(addMinutes(new Date(), 30)), []);
  const [day, setDay] = useState<Date>(startOfDay(initial));
  const [hour, setHour] = useState(pad(initial.getHours()));
  const [minute, setMinute] = useState(pad(initial.getMinutes()));
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(initial));
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const style = useAnchoredPanel(triggerRef, 320, 520, { open, align: "end" });

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
    const when = new Date(day);
    when.setHours(Number(hour), Number(minute), 0, 0);
    // The server wants at least a minute's notice; say so here rather than after Post.
    if (when.getTime() < Date.now() + 60_000) {
      setError("Pick a time at least a minute from now.");
      return;
    }
    commit(when);
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
        className="flex items-center border-l border-black/25 bg-brand px-2 text-white transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <svg viewBox="0 0 10 10" width="9" height="9" fill="none" aria-hidden className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && style && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                style={style}
                /* The same solid overlay surface as the Apex rewrite menu beside it: at 70% the feed's text showed
                   through the calendar. */
                className="overflow-y-auto rounded-card border border-white/10 bg-surface-2 shadow-overlay scrollbar-hide"
              >
                <div className="relative p-3.5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    title="Close scheduling"
                    aria-label="Close scheduling"
                    className="absolute right-3 top-3 text-tertiary transition hover:text-white"
                  >
                    <Icon icon={X} size={16} />
                  </button>

                  <h3 className="mb-3 flex items-center gap-2 pr-6 text-body-sm font-semibold text-white">
                    <Icon icon={Clock} size={16} />
                    Schedule post
                  </h3>

                  {/* Month header */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                      aria-label="Previous month"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-secondary transition hover:bg-white/[0.07] hover:text-white"
                    >
                      <Icon icon={ChevronLeft} size={16} />
                    </button>
                    <span className="text-caption font-semibold text-white">{viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
                    <button
                      type="button"
                      onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                      aria-label="Next month"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-secondary transition hover:bg-white/[0.07] hover:text-white"
                    >
                      <Icon icon={ChevronRight} size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-0.5 text-center">
                    {WEEKDAYS.map((d, i) => (
                      <span key={i} className="py-1 text-caption font-semibold text-tertiary">
                        {d}
                      </span>
                    ))}
                    {buildMonthGrid(viewMonth).map((cell, i) =>
                      cell === null ? (
                        <span key={`blank-${i}`} />
                      ) : (
                        <button
                          key={cell.toISOString()}
                          type="button"
                          disabled={isBeforeToday(cell)}
                          onClick={() => {
                            setDay(cell);
                            setError("");
                          }}
                          aria-pressed={isSameDay(cell, day)}
                          className={`flex h-7 items-center justify-center rounded-md text-caption tabular transition ${
                            isSameDay(cell, day)
                              ? "bg-brand font-semibold text-white"
                              : isBeforeToday(cell)
                                ? "cursor-not-allowed text-neutral-700"
                                : `text-secondary hover:bg-white/[0.08] hover:text-white ${isSameDay(cell, new Date()) ? "ring-1 ring-inset ring-white/20" : ""}`
                          }`}
                        >
                          {cell.getDate()}
                        </button>
                      ),
                    )}
                  </div>

                  {/* Time - the app's own Picker rather than <input type="time">, so no OS widget */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-caption font-semibold text-tertiary">Time</span>
                    <div className="ml-auto flex items-center gap-1">
                      <div className="w-[68px]">
                        <Picker options={HOURS} value={hour} onChange={setHour} ariaLabel="Hour" />
                      </div>
                      <span aria-hidden className="text-tertiary">
                        :
                      </span>
                      <div className="w-[68px]">
                        <Picker options={MINUTES} value={minute} onChange={setMinute} ariaLabel="Minute" />
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-caption font-semibold text-tertiary">Quick options</p>
                  {/* Two by two, so the whole panel fits under the composer without scrolling. */}
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {quickOptions.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => commit(option.date)}
                        className="min-w-0 rounded-control border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-caption text-secondary transition-colors duration-fast hover:border-white/20 hover:bg-white/[0.07] hover:text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
                      >
                        <span className="block truncate font-medium">{option.label}</span>
                        <span className="mt-0.5 block truncate text-caption text-tertiary">
                          {option.date.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </button>
                    ))}
                  </div>

                  {error && <p className="mt-2 text-caption text-brand-text">{error}</p>}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-caption text-tertiary">{localZone()}</span>
                    <button
                      type="button"
                      onClick={schedule}
                      className="shrink-0 rounded-control bg-brand px-4 py-1.5 text-body-sm font-semibold text-white transition-colors duration-fast hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      Schedule
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/** The chosen time, beside Post once it's set: a clock, the time, and a way to take it back. */
export function ScheduledChip({ value, onClear }: { value: string; onClear: () => void }) {
  const when = new Date(value);
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-control border border-white/[0.12] bg-white/[0.04] pl-2 pr-1 text-caption text-primary">
      <Icon icon={Clock} size={16} className="text-tertiary" />
      <span className="whitespace-nowrap tabular">{when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
      <button
        type="button"
        onClick={onClear}
        title="Cancel scheduling"
        aria-label="Cancel scheduling"
        className="flex size-6 items-center justify-center rounded-control text-tertiary transition-colors duration-fast hover:bg-white/[0.07] hover:text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <Icon icon={X} size={16} />
      </button>
    </span>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: pad(h), label: pad(h) }));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => ({ value: pad(i * MINUTE_STEP), label: pad(i * MINUTE_STEP) }));

/** Leading blanks so the 1st lands under its real weekday, then every day of the month. */
function buildMonthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  return cells;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local wall-clock parts, NOT toISOString() - the ISO form is UTC and picks the wrong day for
 * anyone near midnight either side of it. */
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function roundUpToStep(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(Math.ceil(out.getMinutes() / MINUTE_STEP) * MINUTE_STEP, 0, 0);
  return out;
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

/** The next occurrence of a weekday, always in the future - if today is that weekday and the time
 * has passed, it rolls to next week rather than offering a moment already gone. */
function nextDayOfWeek(dayOfWeek: number, hours: number, minutes: number): Date {
  const out = new Date();
  out.setDate(out.getDate() + ((dayOfWeek + 7 - out.getDay()) % 7));
  out.setHours(hours, minutes, 0, 0);
  if (out <= new Date()) out.setDate(out.getDate() + 7);
  return out;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBeforeToday(d: Date): boolean {
  return startOfDay(d).getTime() < startOfDay(new Date()).getTime();
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local time";
  } catch {
    return "local time";
  }
}
