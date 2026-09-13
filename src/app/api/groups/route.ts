import { NextResponse } from "next/server";
import type { CommunityFeatures, CommunityType } from "@/lib/communities";
import { createGroup, discoverCommunities, type DiscoverSort, type GroupVisibility } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

const SORTS: DiscoverSort[] = ["recommended", "trending", "active", "new", "members"];

/** Discover's own search - public communities only (discoverCommunities' doc comment explains why
 * nothing else is ever returned here), no sign-in required to browse since a public community is by
 * definition meant to be found.
 *
 * `groups` is still in the response alongside `communities`: the homepage's DiscoverSection and the
 * original tab both read `body.groups`, and this route is public, so an old cached client bundle
 * must not break the moment this deploys. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getSession();

  const rawSort = searchParams.get("sort");
  const sort = SORTS.includes(rawSort as DiscoverSort) ? (rawSort as DiscoverSort) : "recommended";
  // Repeated ?topic= params rather than one comma-joined value - a topic is free text and may well
  // contain a comma ("Movies, TV").
  const topics = searchParams.getAll("topic").filter(Boolean);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : undefined;

  const result = await discoverCommunities({
    query: searchParams.get("q") ?? undefined,
    topics,
    sort,
    cursor: searchParams.get("cursor") ?? undefined,
    limit,
    uid: session.uid,
  });

  return NextResponse.json({ ...result, groups: result.communities });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    visibility?: GroupVisibility;
    moderationEnabled?: boolean;
    communityType?: CommunityType;
    topic?: string | null;
    tags?: string[];
    features?: CommunityFeatures;
  };
  if (typeof body.name !== "string") return NextResponse.json({ error: "Missing name" }, { status: 400 });

  try {
    const group = await createGroup(session.uid, {
      name: body.name,
      description: body.description,
      visibility: body.visibility,
      moderationEnabled: body.moderationEnabled,
      communityType: body.communityType,
      topic: body.topic,
      tags: body.tags,
      features: body.features,
    });
    return NextResponse.json(group);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
