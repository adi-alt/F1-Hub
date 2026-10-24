"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Picker } from "@/components/ui/Picker";
import { Badge } from "@/components/ui/Badge";
import { PROBLEM_KINDS, problemKindLabel, type ProblemContext, type ProblemStatus } from "@/lib/problemReports";

type Report = {
  id: string;
  kind: string;
  description: string;
  page: string | null;
  context: ProblemContext;
  screenshot: string | null;
  status: ProblemStatus;
  created_at: string;
  reporter: { display_name: string | null; email: string | null } | null;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All statuses" },
];
const KIND_OPTIONS = [{ value: "all", label: "All kinds" }, ...PROBLEM_KINDS.map((k) => ({ value: k.value, label: k.label }))];

/** The site admins' list of "Report a problem" reports, newest first, with Resolve and Reopen. */
export function ProblemReportsPanel() {
  const [status, setStatus] = useState("open");
  const [kind, setKind] = useState("all");
  const queryClient = useQueryClient();
  const { data: reports, isError: failed } = useQuery({
    queryKey: ["problem-reports", status, kind],
    queryFn: async (): Promise<Report[]> => {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      if (kind !== "all") qs.set("kind", kind);
      const res = await fetch(`/api/problem-reports?${qs}`);
      if (!res.ok) throw new Error(`problem reports: ${res.status}`);
      return (await res.json()).reports;
    },
  });

  async function setReportStatus(id: string, next: ProblemStatus) {
    const res = await fetch(`/api/problem-reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (res.ok) await queryClient.invalidateQueries({ queryKey: ["problem-reports"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <Picker options={STATUS_OPTIONS} value={status} onChange={setStatus} ariaLabel="Status" className="w-40" />
        <Picker options={KIND_OPTIONS} value={kind} onChange={setKind} ariaLabel="Kind" className="w-48" />
      </div>
      {failed && <p className="text-body-sm text-danger">Couldn&apos;t load reports.</p>}
      {!failed && !reports && <p className="text-body-sm text-tertiary">Loading reports…</p>}
      {reports?.length === 0 && <p className="text-body-sm text-tertiary">No reports here.</p>}
      <ul className="space-y-3">
        {reports?.map((r) => (
          <li key={r.id} className="rounded-card border border-subtle bg-surface-1 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.status === "open" ? "warning" : "neutral"}>{r.status === "open" ? "Open" : "Resolved"}</Badge>
              <span className="text-body-sm font-semibold text-primary">{problemKindLabel(r.kind)}</span>
              <span className="text-caption text-tertiary">
                {new Date(r.created_at).toLocaleString()} · {r.reporter?.display_name ?? r.reporter?.email ?? "Deleted account"}
              </span>
              <span className="ml-auto">
                <Button variant="secondary" size="sm" onClick={() => void setReportStatus(r.id, r.status === "open" ? "resolved" : "open")}>
                  {r.status === "open" ? "Resolve" : "Reopen"}
                </Button>
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-body-sm text-secondary">{r.description}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-caption sm:grid-cols-[auto_1fr]">
              {r.page && (
                <>
                  <dt className="text-tertiary">Page</dt>
                  <dd className="break-all text-secondary">{r.page}</dd>
                </>
              )}
              {Object.entries(r.context ?? {})
                .filter(([key]) => key !== "url")
                .map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-tertiary">{key}</dt>
                    <dd className="break-all font-mono text-secondary">{value}</dd>
                  </div>
                ))}
            </dl>
            {r.screenshot && (
              <a href={r.screenshot} target="_blank" rel="noreferrer" className="mt-3 block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the report itself */}
                <img src={r.screenshot} alt="Screenshot attached to the report" className="max-h-60 rounded-control border border-subtle" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
