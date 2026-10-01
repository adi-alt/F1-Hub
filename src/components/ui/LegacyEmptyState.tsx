import type { ReactNode } from "react";

/**
 * The one empty-state shell for Communities (Media, Leaderboard, Members, Predictions, Discover
 * all had their own hand-rolled version of "bordered box, centered text" before this - same
 * padding, same border, same font sizes by convention rather than by sharing anything). Consolidated
 * here so every empty surface in this section reads as one deliberate design decision instead of
 * five near-identical ones that happen to look alike.
 *
 * Answers the three things an empty state owes the user (what's missing, why, what to do next) via
 * three slots - `icon` is decorative and optional, `title` is the "what's missing", `description`
 * is the "why", and `action` is the "what next" when there is a real one. A state with nothing
 * useful to do next (e.g. "no scored races yet") just omits `action` rather than getting a
 * fabricated button.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[var(--f1-line)] bg-black/20 px-6 py-10 text-center ${className}`}>
      {icon && (
        <div aria-hidden className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-neutral-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-neutral-300">{title}</p>
      {description && <div className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Small line-icon set shared across the empty states above - not a new icon system, just the
 * handful this section's own states actually need, drawn in the same stroke weight/viewBox
 * convention the rest of this app's inline SVGs already use (see DiscoverSheet's search icon,
 * RaceQuickView's close glyph). */
export const EmptyIcons = {
  media: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 16.5 9.5 12l3 3 2-2 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  members: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="8.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 19c.2-2.2 1.7-3.8 3.8-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 5.5H4.5A1.5 1.5 0 0 0 3 7c0 2 1.5 3.2 3.3 3.4M17 5.5h2.5A1.5 1.5 0 0 1 21 7c0 2-1.5 3.2-3.3 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 13v3.5M9 20h6M9.5 16.5h5l.5 3.5h-6l.5-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  post: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path d="M5 5.5h14M5 10h14M5 14.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 19h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  compass: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="m14.5 9.5-1.7 4.3a1 1 0 0 1-.5.5l-4.3 1.7 1.7-4.3a1 1 0 0 1 .5-.5l4.3-1.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};
