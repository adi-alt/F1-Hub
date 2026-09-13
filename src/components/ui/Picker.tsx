"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";

/** One option row. `imageUrl`/`color` are both optional and mutually independent - a race has
 * neither, a driver has a color, a community has an image. */
export type PickerOption = {
  value: string;
  label: string;
  /** Small trailing/secondary line - a driver's team, a race's date, a community's member count. */
  description?: string;
  /** Right-aligned micro-label: "Round 14", "Completed", "3 open". */
  badge?: string;
  /** Section heading to file this option under. Options keep the order they were given within a
   * section, and sections appear in first-seen order - never re-sorted alphabetically. */
  group?: string;
  imageUrl?: string | null;
  /** Color dot when there's no image (drivers). */
  color?: string;
  /** Rendered, selectable-looking, but inert - with a reason, so it never reads as a bug. */
  disabled?: boolean;
  disabledReason?: string;
};

type Rect = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };

const SEARCH_THRESHOLD = 7; // below this, a search box is more clutter than help
const MIN_DROPDOWN_WIDTH = 260;

/**
 * The app's general-purpose select/combobox: search, full keyboard navigation, portal-rendered so
 * no `overflow:hidden` ancestor can clip it, and real loading/empty/disabled states.
 *
 * WHY A THIRD ONE. This repo already has `SearchableSelect` (a plain text combobox, used by the
 * signup dialog) and `EntityMultiSelect` (Season/Archive/Compare's multi-select with avatars).
 * Neither does arrow-key navigation, a clear affordance, loading/empty/disabled states, or custom
 * value entry, and EntityMultiSelect's own header comment explicitly warns against threading a
 * different interaction model through it because four other pages depend on its exact behavior.
 * So Communities gets this one, and the other two are left untouched rather than destabilized.
 * New surfaces should reach for this; the older two are not worth a risky migration on their own.
 *
 * The portal/flip/measure-available-space positioning below is lifted deliberately from
 * EntityMultiSelect, which learned it the hard way (see its own long comment): measure the real
 * space in each direction, cap the height to what actually fits, and anchor a flipped dropdown by
 * `bottom` rather than a `transform` - framer-motion owns `transform` on a motion.div and silently
 * discards any set outside its own animation props.
 *
 * ponytail: no virtualization. The real lists here are ~20 drivers, ~24 races, ~17 topics. If a
 * community picker ever needs to render thousands of rows, windowing `visible` is the upgrade,
 * not a rewrite.
 */
export function Picker({
  options,
  value,
  onChange,
  placeholder = "Select",
  searchPlaceholder = "Search...",
  emptyLabel = "No matches.",
  loading = false,
  disabled = false,
  clearable = false,
  allowCustomValue = false,
  customValueLabel = (input: string) => `Use "${input}"`,
  ariaLabel,
  className = "",
  align = "start",
}: {
  options: PickerOption[];
  /** Empty string means nothing selected. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Shows skeleton rows instead of options. Selection is blocked while true. */
  loading?: boolean;
  disabled?: boolean;
  /** Adds an "×" on the trigger that sets the value back to "". */
  clearable?: boolean;
  /** Combobox mode: whatever the user typed becomes selectable as its own value. Used for the
   * community topic field, where the listed topics are a starting vocabulary and not a closed set. */
  allowCustomValue?: boolean;
  customValueLabel?: (input: string) => string;
  ariaLabel?: string;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Defers the portal to the client without touching document.body during SSR. Same reasoning (and
  // the same real crash) as EntityMultiSelect's own useSyncExternalStore - see that file.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const selectedOption = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const showSearch = options.length >= SEARCH_THRESHOLD || allowCustomValue;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();

  /** Flat, in render order - what the arrow keys actually walk. Disabled rows stay in the list so
   * they still render, but are skipped when moving.
   *
   * The custom-value row is built inside this memo rather than beside it: as a separate object it
   * was a fresh reference every render, so `visible` was rebuilt every render too and the memo
   * bought nothing. Offered only when genuinely new - typing an existing topic exactly shouldn't
   * produce a duplicate "Use ..." row above the real one. */
  const visible = useMemo(() => {
    const isNew = allowCustomValue && trimmedQuery.length > 0 && !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());
    return isNew ? [{ value: trimmedQuery, label: customValueLabel(trimmedQuery) } as PickerOption, ...filtered] : filtered;
    // customValueLabel is a caller-supplied formatter, stable in practice and only ever read for
    // display - including it would rebuild this on every render for every inline arrow function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowCustomValue, trimmedQuery, options, filtered]);

  /** Section headings, preserving first-seen order. */
  const sections = useMemo(() => {
    const out: { heading: string | null; options: PickerOption[] }[] = [];
    const byHeading = new Map<string, PickerOption[]>();
    for (const option of visible) {
      const key = option.group ?? "";
      const list = byHeading.get(key);
      if (list) list.push(option);
      else byHeading.set(key, [option]);
    }
    for (const [heading, list] of byHeading) out.push({ heading: heading || null, options: list });
    return out;
  }, [visible]);

  const indexOf = useCallback((option: PickerOption) => visible.indexOf(option), [visible]);

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const flip = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(340, flip ? spaceAbove : spaceBelow));
    const width = Math.max(r.width, MIN_DROPDOWN_WIDTH);
    // align="end" right-edge-aligns the panel with the trigger, for triggers sitting at the right
    // of a toolbar where a left-aligned panel would hang off the viewport.
    const left = align === "end" ? Math.max(margin, r.right - width) : r.left;
    setRect(flip ? { bottom: window.innerHeight - r.top, left, width, maxHeight } : { top: r.bottom, left, width, maxHeight });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Focus the search box once the portal has actually mounted. Only a DOM side effect - the
  // highlight itself is set in openPicker(), not here, so nothing sets state in this effect body.
  useEffect(() => {
    if (!open || !showSearch) return;
    searchRef.current?.focus();
  }, [open, showSearch]);

  // A shrinking result set must never leave the highlight pointing past the end of the list. Clamped
  // on read rather than corrected in an effect - an effect here fired a second render on every
  // keystroke in the search box, and briefly rendered an out-of-range highlight before fixing it.
  const activeIndex = rawActiveIndex >= visible.length ? firstEnabledIndex(visible) : rawActiveIndex;

  // Keep the highlighted row in view when arrowing past the edge of the scroll area.
  useEffect(() => {
    if (!open) return;
    dropdownRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  /** Opens on the current selection rather than at the top, so re-opening lands the keyboard where
   * the user left it. */
  function openPicker() {
    const currentIndex = visible.findIndex((o) => o.value === value);
    setActiveIndex(currentIndex >= 0 ? currentIndex : firstEnabledIndex(visible));
    setOpen(true);
  }

  // Returning focus to the trigger is a DOM side effect of having closed, so it happens in an
  // effect rather than inside close() itself. close() is reachable from render-time closures (each
  // option row's onClick), and touching a ref from one of those is exactly what React's
  // refs-during-render rule forbids - the bump-a-counter indirection keeps every ref read inside an
  // effect, where it's always safe.
  const [refocusSignal, setRefocusSignal] = useState(0);

  useEffect(() => {
    if (refocusSignal === 0) return;
    triggerRef.current?.focus();
  }, [refocusSignal]);

  function close(refocus = true) {
    setOpen(false);
    setQuery("");
    if (refocus) setRefocusSignal((n) => n + 1);
  }

  function commit(option: PickerOption | undefined) {
    if (!option || option.disabled || loading) return;
    onChange(option.value);
    close();
  }

  function move(delta: number) {
    setActiveIndex((prev) => nextEnabledIndex(visible, prev, delta));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      // ArrowDown/Enter/Space all open, matching a native select closely enough that muscle memory
      // carries over.
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(firstEnabledIndex(visible));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(nextEnabledIndex(visible, visible.length, -1));
        break;
      case "Enter":
        e.preventDefault();
        commit(visible[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        // Tab commits nothing and closes - moving focus onward shouldn't silently change a value.
        close(false);
        break;
    }
  }

  const triggerLabel = selectedOption?.label ?? (value && allowCustomValue ? value : "");

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && (open ? close(false) : openPicker())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        className={`flex w-full items-center gap-2 rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-left text-sm transition focus:border-white/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
          disabled ? "cursor-not-allowed opacity-50" : "hover:border-white/20"
        }`}
      >
        {selectedOption?.imageUrl !== undefined && selectedOption?.imageUrl !== null && (
          <EntityAvatar imageUrl={selectedOption.imageUrl} name={selectedOption.label} size={20} />
        )}
        {selectedOption?.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selectedOption.color }} aria-hidden />}
        <span className={`flex-1 truncate ${triggerLabel ? "text-white" : "text-neutral-500"}`}>{triggerLabel || placeholder}</span>
        {clearable && value && !disabled && (
          // A span, not a nested <button> - a button inside a button is invalid HTML and React
          // will not render it reliably. Keyboard users clear via Escape-free means: re-open and
          // pick, or use the explicit clear row the consumer can add.
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="shrink-0 rounded p-0.5 text-neutral-500 transition hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition ${open ? "rotate-180" : ""}`} fill="none" aria-hidden>
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isClient &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: -4, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.99 }}
                transition={{ duration: 0.12 }}
                style={{ position: "fixed", top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, maxHeight: rect.maxHeight, zIndex: 120 }}
                className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl"
              >
                {showSearch && (
                  <div className="shrink-0 border-b border-white/10 p-2">
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={searchPlaceholder}
                      aria-label={searchPlaceholder}
                      aria-controls={listboxId}
                      aria-activedescendant={visible[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
                      className="w-full rounded-lg bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
                    />
                  </div>
                )}

                <div id={listboxId} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto p-1">
                  {loading ? (
                    <div className="space-y-1 p-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="skeleton-shimmer h-8 rounded-lg bg-white/[0.04]" />
                      ))}
                    </div>
                  ) : visible.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-neutral-500">{emptyLabel}</p>
                  ) : (
                    sections.map((section, si) => (
                      <div key={section.heading ?? `s${si}`}>
                        {section.heading && (
                          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{section.heading}</p>
                        )}
                        {section.options.map((option) => {
                          const index = indexOf(option);
                          const isActive = index === activeIndex;
                          const isSelected = option.value === value;
                          return (
                            <div
                              key={`${option.value}-${index}`}
                              id={`${listboxId}-${index}`}
                              data-index={index}
                              role="option"
                              aria-selected={isSelected}
                              aria-disabled={option.disabled || undefined}
                              title={option.disabled ? option.disabledReason : undefined}
                              onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                              onClick={() => commit(option)}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                                option.disabled
                                  ? "cursor-not-allowed text-neutral-600"
                                  : isActive
                                    ? "bg-white/[0.07] text-white"
                                    : "text-neutral-300"
                              }`}
                            >
                              {option.imageUrl !== undefined && option.imageUrl !== null && <EntityAvatar imageUrl={option.imageUrl} name={option.label} size={22} />}
                              {option.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.color }} aria-hidden />}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate leading-tight">{option.label}</span>
                                {(option.description || (option.disabled && option.disabledReason)) && (
                                  <span className="block truncate text-[11px] leading-tight text-neutral-500">
                                    {option.disabled && option.disabledReason ? option.disabledReason : option.description}
                                  </span>
                                )}
                              </span>
                              {option.badge && <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-600">{option.badge}</span>}
                              {isSelected && (
                                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-[var(--f1-red)]" fill="none" aria-hidden>
                                  <path d="M4 10.5 8 14.5 16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------- keyboard helpers
// Exported for their own unit test - the wrap-around/all-disabled cases are exactly the kind of
// off-by-one that silently traps a keyboard user.

/** First selectable index, or 0 when every option is disabled (nothing to land on, and returning
 * -1 would break `visible[activeIndex]` lookups). */
export function firstEnabledIndex(options: { disabled?: boolean }[]): number {
  const index = options.findIndex((o) => !o.disabled);
  return index >= 0 ? index : 0;
}

/** Steps `delta` from `from`, skipping disabled rows and wrapping at both ends. Returns `from`
 * unchanged if there's no enabled option anywhere, so an all-disabled list can't spin forever. */
export function nextEnabledIndex(options: { disabled?: boolean }[], from: number, delta: number): number {
  if (options.length === 0) return 0;
  let index = from;
  for (let step = 0; step < options.length; step++) {
    index = (index + delta + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return from;
}
