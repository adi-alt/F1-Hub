import { NextResponse } from "next/server";
import { inviteUsers } from "@/app/users/services/users.service";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { ServiceError } from "@/services/errors";

/** Admin-only invite send. Mirrors the community-invite route's own shape (see
 * api/groups/[id]/invite/route.ts) down to deriving the link's origin from the incoming request
 * rather than an env var that doesn't exist in this codebase. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "invite", session.uid);
  if (limited) return limited;

  const { emails } = (await request.json().catch(() => ({}))) as { emails?: unknown };
  if (!Array.isArray(emails) || emails.some((e) => typeof e !== "string")) {
    return NextResponse.json({ error: "Missing emails" }, { status: 400 });
  }

  try {
    const result = await inviteUsers(session.uid, emails as string[], new URL(request.url).origin);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
