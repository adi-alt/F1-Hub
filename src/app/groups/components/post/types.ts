import type { GroupRole } from "@/lib/supabase/groups";
import type { PostStatus, VoteValue } from "@/lib/supabase/groupPosts";

/** The one post shape every shared post component (PostCard/PostHeader/PostActionBar/...) works
 * against - both GroupPost (a specific group's own feed, always a real group, so groupName/
 * authorRole are known from page context) and FeedPost (the cross-group home feed, group is
 * optional, groupName/groupAvatarUrl carried explicitly, no authorRole) satisfy this structurally
 * without either one needing to change shape or the caller needing to remap fields. */
export type PostCardData = {
  id: string;
  groupId: string | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  userId: string;
  authorName: string;
  authorRole?: GroupRole;
  title: string | null;
  content: string;
  mediaUrl: string | null;
  status?: PostStatus;
  createdAt: string;
  score: number;
  myVote: VoteValue;
  commentCount: number;
};
