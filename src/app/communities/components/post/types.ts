import type { AvatarConfig } from "@/lib/avatar";
import type { F1DataCard, F1Tag, PostKind, PostPollView, PostSubscriptionState, PostTopComment, PredictorFlair } from "@/lib/communities";
import type { GroupRole } from "@/lib/supabase/groups";
import type { PostAttachment, PostStatus, VoteValue } from "@/lib/supabase/groupPosts";
import type { AuthorRecord, PostCallView } from "@/lib/supabase/postCalls";

/** The one post shape every shared post component (PostCard/PostHeader/PostActionBar/...) works
 * against - both GroupPost (a specific group's own feed, always a real group, so groupName/
 * authorRole are known from page context) and FeedPost (the cross-group home feed, group is
 * optional, groupName/groupAvatarUrl carried explicitly, no authorRole) satisfy this structurally
 * without either one needing to change shape or the caller needing to remap fields. */
export type PostCardData = {
  /** Both GroupPost and FeedPost already carry this - surfaced on the card as a small chip for the
   * kinds that actually say something (Question / Race Discussion / Prediction); a plain
   * "discussion" post shows none, since labelling the default adds noise, not information. */
  kind?: PostKind;
  id: string;
  groupId: string | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  userId: string;
  authorName: string;
  /** The author's built avatar, when they have one (profiles.avatar). */
  authorAvatar?: AvatarConfig | null;
  authorRole?: GroupRole;
  title: string | null;
  content: string;
  mediaUrl: string | null;
  /** Real upload metadata - original filename, type, size, generated preview. Null for posts made
   * before it was captured; the attachment renders its typed card in that case rather than
   * falling back to the storage UUID. */
  attachment?: PostAttachment | null;
  /** Multi-image gallery attachments (2–4 images) when uploaded as a set. */
  gallery?: PostAttachment[] | null;
  /** Interactive poll attached to the post. */
  poll?: PostPollView | null;
  status?: PostStatus;
  createdAt: string;
  score: number;
  myVote: VoteValue;
  saved?: boolean;
  commentCount: number;
  commentsLocked?: boolean;
  /** Whether a moderator pinned this post to the top of the community feed. */
  pinned?: boolean;
  /** Whether a comment on this question post has been marked as the accepted answer. */
  answered?: boolean;
  /** 1-line preview of the accepted, pinned, or top comment on this post. */
  topComment?: PostTopComment | null;
  /** Viewer's notification subscription state for this post ("default" | "following" | "muted"). */
  subscription?: PostSubscriptionState;
  /** Structured F1 entity tags (Level 3). */
  f1Tags?: F1Tag[] | null;
  /** Whether the post is flagged as containing spoilers (Level 3). */
  isSpoiler?: boolean;
  /** Interactive F1 Telemetry / Simulation / Stint data card (Level 3.2). */
  dataCard?: F1DataCard | null;
  /** When its author last edited it. */
  editedAt?: string | null;
  /** Whether the viewer wrote it (they may edit and delete it). */
  mine?: boolean;
  /** A call on the race weekend, graded against the result (takes with receipts). */
  call?: PostCallView | null;
  /** The author's season record from their calls. */
  authorRecord?: AuthorRecord | null;
  /** Verified predictor flairs & reputation badges (Level 3.3). */
  authorFlairs?: PredictorFlair[] | null;
};
