import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { listUsers, searchMentions } from "@/app/users/services/users.service";
import { ServiceError } from "@/services/errors";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  // Autocomplete mentions in post/comment composers. Accessible to any signed-in user.
  if (searchParams.get("mention") === "1") {
    try {
      const users = await searchMentions(searchParams.get("q") ?? "", searchParams.get("groupId"));
      return NextResponse.json({ users, nextCursor: null });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
      throw err;
    }
  }

  // `email` is the older spelling of this parameter, from when search was an exact-address
  // lookup only; still honoured so an existing caller/bookmark doesn't 404 into an empty list.
  const search = searchParams.get("q") ?? searchParams.get("email");

  try {
    const { users, nextCursor } = await listUsers(session.uid, searchParams.get("cursor"), search);
    return NextResponse.json({ users, nextCursor });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
