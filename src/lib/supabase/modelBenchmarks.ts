import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";

// Written by pipeline/evaluate_*_benchmark.py (see pipeline/PROGRESS.md's benchmark-infrastructure
// section) — `aggregate`'s exact keys vary per model (MAE/Spearman for Pace, Brier for the
// simulator, etc.), so it's read as a loose bag of metrics rather than a fixed shape; this
// dashboard displays whatever's there instead of hardcoding one model's fields.
export type ModelBenchmark = {
  id: string; // modelVersion, e.g. "sklearn-rf-v3-pace-tyre"
  evaluatedAt: string;
  aggregate: Record<string, unknown>;
};

type ModelBenchmarkRow = { id: string; generated_at: string; metrics: { aggregate?: Record<string, unknown> } | null };

// A short timer, not revalidate:false + a tag: no pipeline script currently calls
// trigger_revalidation for this table, so there's no tag-bust event to hang a cache-forever entry
// off of - a 60s timer is the pragmatic default until one exists.
const REVALIDATE_SECONDS = 60;

export const getModelBenchmarks = unstable_cache(
  async (): Promise<ModelBenchmark[]> => {
    const { data, error } = await queryWithRetry(() => supabaseAdmin.from("model_benchmarks").select("id, generated_at, metrics"));
    if (error) throw new Error(`getModelBenchmarks: ${error.message}`);
    return ((data ?? []) as ModelBenchmarkRow[])
      .map((row) => ({ id: row.id, evaluatedAt: row.generated_at, aggregate: row.metrics?.aggregate ?? {} }))
      .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  },
  ["get-model-benchmarks"],
  { revalidate: REVALIDATE_SECONDS },
);
