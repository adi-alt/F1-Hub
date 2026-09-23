import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { resend } from "@/app/users/services/invites.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  try {
    await resend(session.uid, id, new URL(request.url).origin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
