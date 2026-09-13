// Server-only — never import this from a client component. Talks to GitHub's REST API using
// GITHUB_TOKEN (a PAT scoped to just this repo's actions:read+actions:write — see
// pipeline/README or ask whoever set up ADMIN_EMAILS/GITHUB_TOKEN in Vercel's env vars).

const REPO = "adi-alt/F1-Hub";
const API_BASE = "https://api.github.com";

function authHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set — required for the admin dashboard's GitHub Actions calls.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export type WorkflowRun = {
  id: number;
  status: string; // "queued" | "in_progress" | "completed"
  conclusion: string | null; // "success" | "failure" | ... | null while running
  createdAt: string;
  htmlUrl: string;
};

export async function listRecentRuns(workflowFile: string, limit = 5): Promise<WorkflowRun[]> {
  const res = await fetch(
    `${API_BASE}/repos/${REPO}/actions/workflows/${workflowFile}/runs?per_page=${limit}`,
    { headers: authHeaders(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`GitHub API error listing runs for ${workflowFile}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
  return body.workflow_runs.map((r) => ({
    id: r.id as number,
    status: r.status as string,
    conclusion: r.conclusion as string | null,
    createdAt: r.created_at as string,
    htmlUrl: r.html_url as string,
  }));
}

export async function triggerWorkflow(workflowFile: string): Promise<void> {
  const res = await fetch(`${API_BASE}/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) throw new Error(`GitHub API error triggering ${workflowFile}: ${res.status} ${await res.text()}`);
}
