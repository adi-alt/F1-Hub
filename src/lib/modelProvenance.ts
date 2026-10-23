import type { ModelProvenance } from "@/lib/types/race";

/** "23 Oct", in UTC and en-GB so the server and every browser print the same string. */
function dayLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * ProvenanceLine props for a model output (audit R-41): "Apex model simulator-v2 · 10,000 simulated races · data to
 * 2026 R13 Dutch Grand Prix · updated 23 Oct". Outputs written before the pipeline stamped `provenance` fall back to
 * their own modelVersion/generatedAt and simply leave the data cut-off out.
 */
export function modelProvenanceLine(output: { modelVersion: string; generatedAt?: string; provenance?: ModelProvenance }, what?: string): { source: string; status?: string; updated?: string } {
  const p = output.provenance;
  const cutoff = p?.dataCutoff ? `data to ${p.dataCutoff}` : undefined;
  const status = [what, cutoff].filter(Boolean).join(" · ") || undefined;
  return { source: `Apex model ${p?.modelVersion ?? output.modelVersion}`, status, updated: dayLabel(p?.generatedAt ?? output.generatedAt) };
}
