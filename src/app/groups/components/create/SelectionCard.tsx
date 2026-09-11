"use client";

import { useRef } from "react";

/**
 * The interactive card used by the "what are you creating" and "who can see this" steps - the
 * explicit ask was cards that don't feel like generic radio buttons, while still *behaving* like
 * radio buttons for anyone not using a mouse.
 *
 * So: real `role="radio"` semantics inside a `role="radiogroup"`, roving tabindex (only the
 * selected card is in the tab order), and arrow keys that move the selection the way a native
 * radio group does. Visually it's a card; to a screen reader it's a radio group.
 */
export function SelectionCardGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Arrow keys move between cards and select as they go, matching native radio behavior. Handled
  // at the group level so each card doesn't need to know about its siblings.
  function onKeyDown(e: React.KeyboardEvent) {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
    if (!keys.includes(e.key)) return;
    const cards = [...(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])') ?? [])];
    if (cards.length === 0) return;
    e.preventDefault();
    const current = cards.findIndex((c) => c === document.activeElement);
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    const next = cards[(Math.max(current, 0) + delta + cards.length) % cards.length];
    next?.focus();
    next?.click();
  }

  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  );
}

export function SelectionCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  footnote,
  disabled = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon?: React.ReactNode;
  /** Small trailing line - examples for a community type, a caveat for a visibility option. */
  footnote?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      // Roving tabindex: the group is one tab stop, arrows move within it.
      tabIndex={selected ? 0 : -1}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex cursor-pointer flex-col rounded-xl border p-3.5 text-left transition focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
        disabled
          ? "cursor-not-allowed border-[var(--f1-line)] opacity-40"
          : selected
            ? "border-[var(--f1-red)] bg-[var(--f1-red)]/[0.07]"
            : "border-[var(--f1-line)] hover:border-white/25 hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span
            aria-hidden
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
              selected ? "bg-[var(--f1-red)]/15 text-[var(--f1-red)]" : "bg-white/[0.04] text-neutral-400 group-hover:text-neutral-200"
            }`}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="mt-0.5 block text-xs leading-snug text-neutral-500">{description}</span>
          {footnote && <span className="mt-1.5 block text-[11px] leading-snug text-neutral-600">{footnote}</span>}
        </span>
        <span
          aria-hidden
          className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border transition ${
            selected ? "border-[var(--f1-red)] bg-[var(--f1-red)]" : "border-white/20"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 14 14" className="h-full w-full text-white" fill="none">
              <path d="M3.5 7.2 6 9.7l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
}
