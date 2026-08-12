import { NextResponse } from "next/server";
import { listRecentRuns } from "@/lib/github";
import { permissionsForRole } from "@/lib/rbac";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

const WORKFLOWS = ["fetch-races.yml", "sync-calendar.yml"] as const;

export async function GET() {
  const session = await getSession();
  const role = await getUserRole(session.uid);
  if (!permissionsForRole(role).canAccessAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const runs = await Promise.all(
    WORKFLOWS.map(async (workflow) => ({ workflow, runs: await listRecentRuns(workflow) })),
  );
  return NextResponse.json({ runs });
}
