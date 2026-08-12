import { NextResponse } from "next/server";
import { getModelBenchmarks } from "@/lib/firestore/admin";
import { permissionsForRole } from "@/lib/rbac";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

export async function GET() {
  const session = await getSession();
  const role = await getUserRole(session.uid);
  if (!permissionsForRole(role).canAccessAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const benchmarks = await getModelBenchmarks();
  return NextResponse.json({ benchmarks });
}
