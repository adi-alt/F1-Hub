import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";

// Written by pipeline/evaluate_*_benchmark.py (see pipeline/PROGRESS.md's benchmark-infrastructure
// section) — `aggregate`'s exact keys vary per model (MAE/Spearman for Pace, Brier for the
// simulator, etc.), so it's read as a loose bag of metrics rather than a fixed shape; this
// dashboard displays whatever's there instead of hardcoding one model's fields.
export type ModelBenchmark = {
  id: string; // modelVersion, e.g. "sklearn-rf-v3-pace-tyre"
  evaluatedAt: string;
  aggregate: Record<string, unknown>;
};

const REVALIDATE_SECONDS = 60; // admin data should feel fresher than the public 300s pages

export const getModelBenchmarks = unstable_cache(
  async (): Promise<ModelBenchmark[]> => {
    const snap = await adminDb.collection("modelBenchmarks").get();
    return snap.docs
      .map((d) => {
        const data = d.data() as { evaluatedAt: string; aggregate: Record<string, unknown> };
        return { id: d.id, evaluatedAt: data.evaluatedAt, aggregate: data.aggregate };
      })
      .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  },
  ["get-model-benchmarks"],
  { revalidate: REVALIDATE_SECONDS },
);
