import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ActivityEntry } from "@/lib/homeData";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Secondary, lowest-priority section — real timestamped events only (see homeData's
 * buildRecentActivity), never fabricated. */
export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Recent activity</h2>
      <motion.ul initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerContainer} className="mt-4 space-y-2">
        {entries.map((entry) => (
          <motion.li key={entry.key} variants={staggerItem} className="flex items-baseline gap-3 text-sm">
            <span className="text-neutral-300">{entry.text}</span>
            <span className="shrink-0 text-xs text-neutral-600">{timeAgo(entry.timestamp)}</span>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

export function RecentActivitySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="skeleton-shimmer h-4 w-64 max-w-full rounded" />
      ))}
    </div>
  );
}
