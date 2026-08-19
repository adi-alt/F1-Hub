import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

const REVALIDATE_SECONDS = 60; // admin data should feel fresher than the public 300s pages

export const getModelBenchmarks = unstable_cache(
  async (): Promise<ModelBenchmark[]> => {
    const { data } = await supabaseAdmin.from("model_benchmarks").select("id, generated_at, metrics");
    return ((data ?? []) as ModelBenchmarkRow[])
      .map((row) => ({ id: row.id, evaluatedAt: row.generated_at, aggregate: row.metrics?.aggregate ?? {} }))
      .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  },
  ["get-model-benchmarks"],
  { revalidate: REVALIDATE_SECONDS },
);
