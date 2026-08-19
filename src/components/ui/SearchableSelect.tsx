"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SearchableOption = { value: string; label: string };

type Rect = { top: number; left: number; width: number; flip: boolean };

/** A styled combobox for a plain-text field: type to filter, click (or Enter) to pick. The
 * option list is portaled straight to document.body and positioned with `fixed` coordinates
 * computed from the input's own rect - it's never a DOM descendant of whatever container this
 * sits in, so an `overflow-y-auto` ancestor (the signup dialog's profile step, in particular)
 * can never clip it or grow because of it. Flips to render above the input when there isn't
 * enough room below (common here since the dialog itself is height-constrained). */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function updatePosition() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimatedHeight = Math.min(filtered.length, 6) * 36 + 8;
    const flip = r.bottom + estimatedHeight > window.innerHeight && r.top - estimatedHeight > 0;
    setRect({ top: flip ? r.top : r.bottom, left: r.left, width: r.width, flip });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // capture:true so a scroll on any ancestor (not just window) still repositions this - scroll
    // events don't bubble, but a capture-phase listener on window still sees them on their way
    // down to the target.
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  // Not useOnClickOutside (src/hooks) - that only checks one ref, and the dropdown itself lives
  // outside rootRef in the DOM (it's portaled), so a click on an option would otherwise register
  // as "outside" and close the list before the option's own onClick ever fires.
  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function selectOption(opt: SearchableOption) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            selectOption(filtered[0]);
          }
        }}
        className={className}
      />
      {selected && (
        <button
          type="button"
          aria-label={`Clear ${placeholder}`}
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition hover:text-white"
        >
          ×
        </button>
      )}
      {open &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              transform: rect.flip ? "translateY(-100%)" : undefined,
            }}
            className="z-[200] max-h-56 overflow-y-auto rounded-lg border border-[var(--f1-line)] bg-zinc-900 shadow-xl"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-neutral-500">No matches</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => selectOption(opt)}
                  className="block w-full truncate px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
