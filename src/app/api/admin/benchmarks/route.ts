import { NextResponse } from "next/server";
import { getModelBenchmarks } from "@/lib/firestore/admin";
import { getSession } from "@/lib/session/getSession";
import { isAdmin } from "@/lib/session/isAdmin";

export async function GET() {
  const session = await getSession();
  if (!(await isAdmin(session.uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const benchmarks = await getModelBenchmarks();
  return NextResponse.json({ benchmarks });
}
