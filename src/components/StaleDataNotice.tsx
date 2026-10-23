import { Alert } from "@/components/ui/Alert";
import { PageContainer } from "@/components/ui/PageContainer";
import { getStaleData } from "@/lib/observability/readHealth";

/** "race results and model predictions" */
function joinLabels(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The site-wide stale-data notice (audit R-52): shown only while a job whose output readers see has gone past its
 * freshness limit (lib/observability/health.ts staleData), and nothing at all otherwise.
 */
export async function StaleDataNotice() {
  const stale = await getStaleData();
  if (stale.length === 0) return null;
  const oldest = Math.max(...stale.map((s) => s.ageHours));
  const labels = joinLabels(stale.map((s) => s.label));
  return (
    <PageContainer width="wide" className="pt-3">
      <Alert tone="warning" title="Some data may be out of date">
        {`Updates to ${labels} are behind: the last one finished about ${oldest} hours ago. Everything shown is real, just not the newest.`}
      </Alert>
    </PageContainer>
  );
}
