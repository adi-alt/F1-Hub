import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getInvites, sendInvites, type InviteInput } from "@/app/users/services/invites.service";
import { ServiceError } from "@/services/errors";

export async function GET() {
  const session = await getSession();
  try {
    return NextResponse.json({ invites: await getInvites(session.uid) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

/** Only "admin" and "moderator" are accepted as a role; anything else — including the string
 * "user" — normalises to null, which is how this codebase spells the member tier everywhere
 * (profiles.role is nullable, see lib/rbac.ts). */
function parseRole(value: unknown): "admin" | "moderator" | null {
  return value === "admin" || value === "moderator" ? value : null;
}

function parseEntries(body: unknown): InviteInput[] | null {
  if (!body || typeof body !== "object") return null;
  const { invites } = body as { invites?: unknown };
  if (!Array.isArray(invites)) return null;

  const parsed: InviteInput[] = [];
  for (const raw of invites) {
    if (!raw || typeof raw !== "object") return null;
    const { email, role } = raw as { email?: unknown; role?: unknown };
    if (typeof email !== "string") return null;
    parsed.push({ email, role: parseRole(role) });
  }
  return parsed;
}

export async function POST(request: Request) {
  const session = await getSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const entries = parseEntries(body);
  if (!entries) return NextResponse.json({ error: "Expected an `invites` array of { email, role }." }, { status: 400 });

  try {
    // Single and bulk are the same operation with different list lengths — one code path, so a
    // fix to validation or delivery can't apply to one and miss the other.
    const result = await sendInvites(session.uid, entries, new URL(request.url).origin);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
