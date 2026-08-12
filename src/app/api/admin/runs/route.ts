import { NextResponse } from "next/server";
import { listRecentRuns } from "@/lib/github";
import { getSession } from "@/lib/session/getSession";
import { isAdmin } from "@/lib/session/isAdmin";

const WORKFLOWS = ["fetch-races.yml", "sync-calendar.yml"] as const;

export async function GET() {
  const session = await getSession();
  if (!(await isAdmin(session.uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const runs = await Promise.all(
    WORKFLOWS.map(async (workflow) => ({ workflow, runs: await listRecentRuns(workflow) })),
  );
  return NextResponse.json({ runs });
}
