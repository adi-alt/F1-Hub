import { NextResponse } from "next/server";
import { triggerWorkflow } from "@/lib/github";
import { getSession } from "@/lib/session/getSession";
import { isAdmin } from "@/lib/session/isAdmin";

const ALLOWED_WORKFLOWS = new Set(["fetch-races.yml", "sync-calendar.yml"]);

// A mutating action — re-checks isAdmin server-side rather than trusting that only the admin
// page's UI would ever call this, same discipline as every other write path in this app.
export async function POST(request: Request) {
  const session = await getSession();
  if (!(await isAdmin(session.uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { workflow } = (await request.json()) as { workflow?: string };
  if (!workflow || !ALLOWED_WORKFLOWS.has(workflow)) {
    return NextResponse.json({ error: "Unknown workflow" }, { status: 400 });
  }

  await triggerWorkflow(workflow);
  return NextResponse.json({ ok: true });
}
