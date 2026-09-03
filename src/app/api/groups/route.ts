import { NextResponse } from "next/server";
import { createGroup, listPublicGroups, type GroupVisibility } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** Discover Groups' own search - public groups only (listPublicGroups' own doc comment explains
 * why nothing else is ever returned here), no sign-in required to browse since a public group is
 * by definition meant to be found. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getSession();
  const groups = await listPublicGroups(searchParams.get("q") ?? undefined, session.uid);
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: string; description?: string; visibility?: GroupVisibility };
  if (typeof body.name !== "string") return NextResponse.json({ error: "Missing name" }, { status: 400 });

  try {
    const group = await createGroup(session.uid, { name: body.name, description: body.description, visibility: body.visibility });
    return NextResponse.json(group);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
