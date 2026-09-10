// A short, F1-flavored "what's loading" line shown above a route's skeleton - different copy per
// section (see each loading.tsx's own call) rather than one generic "Loading..." everywhere.
// Plain CSS pulse, not framer-motion - a loading state animating itself in/out reads as the
// loading experience flickering, not as polish (see HomeShell.tsx's own comment on the same
// reasoning for the skeleton <-> real-content swap).
export function SectionLoadingMessage({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--f1-red)]" />
      {label}
    </div>
  );
}
