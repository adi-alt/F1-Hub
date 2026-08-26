/** `tone="light"` for a skeleton sitting on the season section's white-glass cards — the default
 * `bg-white/10` shimmer is tuned for the rest of the site's dark cards and is nearly invisible on
 * a light surface. */
export function Skeleton({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const base = tone === "light" ? "bg-black/10" : "bg-white/10";
  return <div className={`animate-pulse rounded-md ${base} ${className}`} />;
}
