import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { revoke } from "@/app/users/services/invites.service";
import { ServiceError } from "@/services/errors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  try {
    await revoke(session.uid, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
