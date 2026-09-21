import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAllCurrentDrivers } from "@/lib/supabase/media";

/**
 * "Since you were last here" for Communities - a real diff, not a summary of the present.
 *
 * The same discipline as the homepage's own sinceLastVisit engine: the previous visit timestamp is
 * read BEFORE it is overwritten, every number is a real count over that window, and a first-ever
 * visit returns hasPriorVisit: false rather than a fabricated "nothing changed" (there is genuinely
 * no prior state to diff against, and saying "no changes" would be a claim we can't support).
 *
 * Deliberately NOT an LLM call: every line the widget renders is a count, and a model paraphrasing
 * counts it was handed adds latency and a hallucination surface to something already exact. Ask
 * Apex remains the place to ask about this data in prose.
 */
export type CommunityPulseData = {
  hasPriorVisit: boolean;
  /** The instant this diff is measured from - null on a first visit. */
  since: string | null;
  newPosts: number;
  /** Replies on the viewer's OWN posts, which is the delta they care about most. */
  repliesToYou: number;
  newPredictionEntries: number;
  openPredictions: number;
  mostActive: { id: string; name: string; posts: number } | null;
  /** The post drawing the most conversation right now, so the widget names something real to go
   * read rather than only counting things. Null when nothing has been commented on. */
  mostDiscussed: { postId: string; groupId: string; excerpt: string; comments: number } | null;
  /** Where one open round is actually leaning - the real leading option and its real share, from
   * entries that exist. Null unless a round has enough entries to mean anything. */
  predictionPulse: { predictionId: string; groupId: string; raceName: string; leader: string; pct: number; total: number } | null;
};

const EMPTY: CommunityPulseData = {
  hasPriorVisit: false,
  since: null,
  newPosts: 0,
  repliesToYou: 0,
  newPredictionEntries: 0,
  openPredictions: 0,
  mostActive: null,
  mostDiscussed: null,
  predictionPulse: null,
};

/**
 * Reads the diff and stamps the visit. Called once per Communities page load from the server
 * component, so the window is genuinely "since the last time you opened this page".
 *
 * A failure anywhere here degrades to the first-visit shape rather than throwing: the pulse widget
 * is context beside the feed, and it must not be able to take the page down with it.
 */
export async function getCommunityPulse(uid: string): Promise<CommunityPulseData> {
  try {
    const { data: profile, error: profileError } = await queryWithRetry(() =>
      supabaseAdmin.from("profiles").select("last_communities_visit_at").eq("id", uid).maybeSingle(),
    );
    if (profileError) throw new Error(profileError.message);

    const since = (profile?.last_communities_visit_at as string | null) ?? null;

    // Stamp the visit regardless of what the diff below finds, so a page load always advances the
    // window - otherwise an error in one count would make the next visit re-report the same items.
    void supabaseAdmin
      .from("profiles")
      .update({ last_communities_visit_at: new Date().toISOString() })
      .eq("id", uid)
      .then(() => undefined);

    const { data: memberships, error: membershipsError } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
    if (membershipsError) throw new Error(membershipsError.message);
    const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id as string))];
    if (groupIds.length === 0) return { ...EMPTY, hasPriorVisit: since !== null, since };

    const [{ data: openPredictionRows }, { data: myPostRows }] = await Promise.all([
      queryWithRetry(() => supabaseAdmin.from("group_predictions").select("id").in("group_id", groupIds).eq("status", "open")),
      queryWithRetry(() => supabaseAdmin.from("group_posts").select("id").eq("user_id", uid).in("group_id", groupIds)),
    ]);
    const openPredictionIds = (openPredictionRows ?? []).map((p) => p.id as string);
    const myPostIds = (myPostRows ?? []).map((p) => p.id as string);

    if (since === null) {
      // First visit: nothing to diff, but the standing figures are still real and worth showing.
      const [mostDiscussed, predictionPulse] = await Promise.all([findMostDiscussed(groupIds, null), findPredictionPulse(openPredictionIds)]);
      return { ...EMPTY, hasPriorVisit: false, since: null, openPredictions: openPredictionIds.length, mostDiscussed, predictionPulse };
    }

    const [{ data: newPostRows }, { data: replyRows }, { data: entryRows }] = await Promise.all([
      // Other people's posts - a digest that counted the viewer's own would be telling them about
      // themselves. Scheduled posts aren't published yet, so they aren't news either.
      queryWithRetry(() =>
        supabaseAdmin.from("group_posts").select("group_id").in("group_id", groupIds).eq("status", "published").neq("user_id", uid).gt("created_at", since),
      ),
      myPostIds.length > 0
        ? queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("id").in("post_id", myPostIds).neq("user_id", uid).gt("created_at", since))
        : Promise.resolve({ data: [], error: null }),
      openPredictionIds.length > 0
        ? queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id").in("prediction_id", openPredictionIds).gt("created_at", since))
        : Promise.resolve({ data: [], error: null }),
    ]);

    const postsByGroup = new Map<string, number>();
    for (const row of newPostRows ?? []) {
      const id = row.group_id as string;
      postsByGroup.set(id, (postsByGroup.get(id) ?? 0) + 1);
    }

    let mostActive: CommunityPulseData["mostActive"] = null;
    if (postsByGroup.size > 0) {
      const [topId, posts] = [...postsByGroup.entries()].sort((a, b) => b[1] - a[1])[0];
      const { data: group } = await queryWithRetry(() => supabaseAdmin.from("groups").select("id, name").eq("id", topId).maybeSingle());
      if (group) mostActive = { id: group.id as string, name: group.name as string, posts };
    }

    const [mostDiscussed, predictionPulse] = await Promise.all([findMostDiscussed(groupIds, since), findPredictionPulse(openPredictionIds)]);

    return {
      hasPriorVisit: true,
      since,
      newPosts: (newPostRows ?? []).length,
      repliesToYou: (replyRows ?? []).length,
      newPredictionEntries: (entryRows ?? []).length,
      openPredictions: openPredictionIds.length,
      mostActive,
      mostDiscussed,
      predictionPulse,
    };
  } catch {
    return EMPTY;
  }
}

/** Fewest entries a round needs before its split is worth stating. Below this, "64% backing X"
 * would be one or two people described as a trend. */
const MIN_ENTRIES_FOR_PULSE = 3;

/**
 * The post pulling the most conversation. Comments are counted in the window when there is one, so
 * an old thread that went quiet doesn't outrank a new one that is actually busy right now.
 */
async function findMostDiscussed(groupIds: string[], since: string | null): Promise<CommunityPulseData["mostDiscussed"]> {
  const { data: posts } = await queryWithRetry(() =>
    supabaseAdmin.from("group_posts").select("id, group_id, title, content").in("group_id", groupIds).eq("status", "published").order("created_at", { ascending: false }).limit(60),
  );
  const candidates = posts ?? [];
  if (candidates.length === 0) return null;

  let commentQuery = supabaseAdmin
    .from("group_post_comments")
    .select("post_id")
    .in(
      "post_id",
      candidates.map((p) => p.id as string),
    );
  if (since) commentQuery = commentQuery.gt("created_at", since);
  const { data: comments } = await queryWithRetry(() => commentQuery);

  const counts = new Map<string, number>();
  for (const c of comments ?? []) {
    const id = c.post_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;

  const post = candidates.find((p) => (p.id as string) === top[0]);
  if (!post) return null;
  const text = ((post.title as string | null) || (post.content as string)).trim();
  return {
    postId: post.id as string,
    groupId: post.group_id as string,
    excerpt: text.length > 70 ? `${text.slice(0, 70).trimEnd()}…` : text,
    comments: top[1],
  };
}

/**
 * Which way one open round is leaning. Picks the round with the most entries (the one whose split
 * actually means something) and reports its real leader and share - never a rounded-up guess, and
 * nothing at all below the threshold.
 */
async function findPredictionPulse(openPredictionIds: string[]): Promise<CommunityPulseData["predictionPulse"]> {
  if (openPredictionIds.length === 0) return null;
  const { data: entries } = await queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, guess").in("prediction_id", openPredictionIds));
  if (!entries?.length) return null;

  const byPrediction = new Map<string, string[]>();
  for (const e of entries) {
    const id = e.prediction_id as string;
    const guess = e.guess;
    // Only single-value guesses have one comparable "who is being backed"; a podium array and a
    // DNF count don't reduce to one name, so they're left out rather than mangled into one.
    if (typeof guess !== "string") continue;
    byPrediction.set(id, [...(byPrediction.get(id) ?? []), guess]);
  }

  const best = [...byPrediction.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!best || best[1].length < MIN_ENTRIES_FOR_PULSE) return null;

  const [predictionId, guesses] = best;
  const tally = new Map<string, number>();
  for (const g of guesses) tally.set(g, (tally.get(g) ?? 0) + 1);
  const [code, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];

  const [{ data: prediction }, drivers] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_predictions").select("group_id, race_id").eq("id", predictionId).maybeSingle()),
    getAllCurrentDrivers().catch(() => []),
  ]);
  if (!prediction) return null;
  const { data: race } = await queryWithRetry(() => supabaseAdmin.from("races").select("name").eq("id", prediction.race_id as string).maybeSingle());

  return {
    predictionId,
    groupId: prediction.group_id as string,
    raceName: (race?.name as string | undefined) ?? "this round",
    leader: drivers.find((d) => d.code === code)?.name ?? code,
    pct: Math.round((count / guesses.length) * 100),
    total: guesses.length,
  };
}
