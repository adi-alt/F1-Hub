"use client";

import { usePipelineRuns, useTriggerPipelineRun } from "@/models/queries/usePipelineRuns";
import type { WorkflowRun } from "@/lib/github";

const WORKFLOW_LABELS: Record<string, string> = {
  "fetch-races.yml": "Fetch race data and predict",
  "sync-calendar.yml": "Sync calendar",
};

function statusLabel(run: WorkflowRun): string {
  if (run.status !== "completed") return run.status;
  return run.conclusion ?? "unknown";
}

function statusColor(run: WorkflowRun): string {
  if (run.status !== "completed") return "text-amber-400";
  return run.conclusion === "success" ? "text-emerald-400" : "text-red-400";
}

export function PipelineOpsPanel() {
  const { data, isError } = usePipelineRuns();
  const trigger = useTriggerPipelineRun();

  if (isError) return <p className="text-sm text-red-400">Couldn&apos;t load recent runs.</p>;
  if (!data) return <p className="text-sm text-neutral-500">Loading recent runs…</p>;

  return (
    <div className="space-y-6">
      {trigger.isError && <p className="text-sm text-red-400">Failed to trigger {trigger.variables}.</p>}
      {data.map(({ workflow, runs }) => (
        <div key={workflow}>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-neutral-200">{WORKFLOW_LABELS[workflow] ?? workflow}</h4>
            <button
              onClick={() => trigger.mutate(workflow)}
              disabled={trigger.isPending}
              className="rounded-full border border-[var(--f1-line)] px-3 py-1 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
            >
              {trigger.isPending && trigger.variables === workflow ? "Triggering…" : "Run now"}
            </button>
          </div>
          {runs.length === 0 ? (
            <p className="text-xs text-neutral-500">No runs recorded yet.</p>
          ) : (
            <ul className="space-y-1">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center justify-between text-xs">
                  <a href={run.htmlUrl} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-neutral-200">
                    {new Date(run.createdAt).toLocaleString()}
                  </a>
                  <span className={statusColor(run)}>{statusLabel(run)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
