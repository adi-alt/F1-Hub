import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getBenchmarks } from "@/services/admin.service";
import { ServiceError } from "@/services/errors";

export async function GET() {
  const session = await getSession();
  try {
    const benchmarks = await getBenchmarks(session.uid);
    return NextResponse.json({ benchmarks });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
