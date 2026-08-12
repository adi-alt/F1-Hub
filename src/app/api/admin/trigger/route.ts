import { NextResponse } from "next/server";
import { triggerWorkflow } from "@/lib/github";
import { permissionsForRole } from "@/lib/rbac";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

const ALLOWED_WORKFLOWS = new Set(["fetch-races.yml", "sync-calendar.yml"]);

// A mutating, admin-only action (moderators can view runs but not trigger them) — re-checks
// role server-side rather than trusting the admin page's UI, same discipline as every other
// write path in this app.
export async function POST(request: Request) {
  const session = await getSession();
  const role = await getUserRole(session.uid);
  if (!permissionsForRole(role).canTriggerPipelineRuns) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { workflow } = (await request.json()) as { workflow?: string };
  if (!workflow || !ALLOWED_WORKFLOWS.has(workflow)) {
    return NextResponse.json({ error: "Unknown workflow" }, { status: 400 });
  }

  await triggerWorkflow(workflow);
  return NextResponse.json({ ok: true });
}
