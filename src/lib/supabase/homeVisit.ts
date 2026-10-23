import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getJoinedGroupIds } from "@/lib/supabase/groupPosts";

/** Other people's published posts in the user's communities since `since`: the home's "since your
 * last visit" count. A real count, not the length of a capped feed page. */
export async function countNewCommunityPosts(uid: string, since: string): Promise<number> {
  const groupIds = await getJoinedGroupIds(uid);
  if (groupIds.length === 0) return 0;
  const { count, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("group_posts")
      .select("id", { count: "exact", head: true })
      .in("group_id", groupIds)
      .eq("status", "published")
      .neq("user_id", uid)
      .gt("created_at", since),
  );
  if (error) throw new Error(`countNewCommunityPosts: ${error.message}`);
  return count ?? 0;
}
