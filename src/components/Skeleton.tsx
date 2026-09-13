// A shimmering placeholder for anything loading in — one shared shape instead of a bespoke
// `animate-pulse` div wherever something's async, so loading states look like one system.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/10 ${className}`} />;
}
