import { Badge } from "@/components/ui/Badge";
import { STALE_AFTER_MINUTES, type Health } from "@/lib/observability/health";

/** "3h 20m", "2d 4h" */
function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

/**
 * Each pipeline job's freshness from pipeline_runs (audit R-52), the same evaluation /api/health and the site-wide
 * stale-data notice use: how long since its last success, against its limit, and any failure streak.
 */
export function PipelineFreshness({ health }: { health: Health }) {
  if (health.database === "error") return <p className="text-sm text-tertiary">Couldn&apos;t read pipeline_runs.</p>;
  if (!health.pipeline) return <p className="text-sm text-tertiary">No pipeline runs recorded yet.</p>;
  const jobs = Object.entries(health.pipeline).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-white/[0.06]">
        {jobs.map(([job, h]) => {
          const limit = STALE_AFTER_MINUTES[job] ?? 36 * 60;
          const stale = h.lastSuccessAgeMinutes === null || h.lastSuccessAgeMinutes > limit;
          return (
            <li key={job} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-mono text-primary">{job}</span>
              <span className="flex items-center gap-3 text-caption tabular text-secondary">
                <span>{h.lastSuccessAgeMinutes === null ? "never succeeded" : `last success ${ageLabel(h.lastSuccessAgeMinutes)} ago`}</span>
                <span className="text-tertiary">limit {ageLabel(limit)}</span>
                {h.failuresSinceSuccess > 0 && <span>{h.failuresSinceSuccess} failed since</span>}
                <Badge tone={stale ? "danger" : h.failuresSinceSuccess >= 3 ? "warning" : "success"}>{stale ? "Stale" : h.failuresSinceSuccess >= 3 ? "Failing" : "Fresh"}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-tertiary">pipeline_runs · checked {health.checkedAt.slice(11, 16)} UTC</p>
    </div>
  );
}
