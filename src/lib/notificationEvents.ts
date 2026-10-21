import { supabaseAdmin } from "@/lib/supabase/admin";
import { communityMembers, communityModerators, notify } from "@/lib/supabase/notifications";
import { groupHref } from "@/lib/routes";
import { predictionTypeLabels, type PredictionType } from "@/lib/groupPredictionTypes";

/**
 * Each event the site notifies about, raised from the one place in the code where it happens, with who should hear
 * about it decided here: the person it happened to, or a community's moderators, or its members - never whoever caused
 * it (notify drops the actor). Every function is fire-and-forget safe: notify never throws, and the lookups here
 * fall back to plain wording when a name can't be read.
 */

async function groupName(groupId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("groups").select("name").eq("id", groupId).maybeSingle();
  return (data?.name as string | undefined) ?? "your community";
}

async function personName(uid: string): Promise<string> {
  const { data } = await supabaseAdmin.from("profiles").select("first_name, username").eq("id", uid).maybeSingle();
  return (data?.first_name as string | null) ?? (data?.username as string | null) ?? "Someone";
}

const safely = async (work: () => Promise<void>) => {
  try {
    await work();
  } catch (err) {
    console.error("notification event failed:", err instanceof Error ? err.message : err);
  }
};

/** Someone was invited by email and already has an account: the invitation shows on the site too, with the same
 * link. The email itself went from inviteByEmail, so this is a site notice only (the kind is siteOnly). */
export const notifyInvited = (groupId: string, userId: string, inviterId: string, href: string) =>
  safely(async () => {
    const [community, inviter] = await Promise.all([groupName(groupId), personName(inviterId)]);
    await notify([userId], {
      kind: "invite",
      title: `${inviter} invited you to ${community}`,
      body: "Open it to join.",
      href,
      actorId: inviterId,
      groupId,
      dedupeKey: `invite:${groupId}:${new Date().toISOString().slice(0, 10)}`,
    });
  });

/** A prediction round was settled: each person who entered hears whether they called it, and what they won. */
export const notifyPredictionSettled = (groupId: string, predictionId: string, type: PredictionType, raceName: string) =>
  safely(async () => {
    const { data: entries } = await supabaseAdmin.from("group_prediction_entries").select("user_id, points_awarded").eq("prediction_id", predictionId);
    const community = await groupName(groupId);
    const label = predictionTypeLabels[type] ?? "Prediction";
    await Promise.all(
      (entries ?? []).map((e) => {
        const won = ((e.points_awarded as number | null) ?? 0) > 0;
        return notify([e.user_id as string], {
          kind: "prediction_result",
          title: won ? `You called it: ${label}, ${raceName}` : `Not this time: ${label}, ${raceName}`,
          body: won ? `+${e.points_awarded} points in ${community}.` : `Settled in ${community}. The next round is a fresh start.`,
          href: `${groupHref(groupId)}&tab=predictions`,
          groupId,
          dedupeKey: `prediction_result:${predictionId}`,
        });
      }),
    );
  });

/** A new prediction round opened: everyone in the community but whoever opened it. */
export const notifyNewRound = (groupId: string, predictionId: string, creatorId: string, type: PredictionType, raceName: string) =>
  safely(async () => {
    const [members, community] = await Promise.all([communityMembers(groupId), groupName(groupId)]);
    await notify(members, {
      kind: "new_round",
      title: `New round in ${community}: ${predictionTypeLabels[type] ?? "Prediction"}`,
      body: `${raceName}. Enter before it locks at qualifying.`,
      href: `${groupHref(groupId)}&tab=predictions`,
      actorId: creatorId,
      groupId,
      dedupeKey: `new_round:${predictionId}`,
    });
  });

/** A reply: the post's author hears about a comment on their post; a comment's author about a reply to it. */
export const notifyReply = (groupId: string | null, postId: string, commentId: string, commenterId: string, parentCommentId: string | null) =>
  safely(async () => {
    const [{ data: post }, parent, name] = await Promise.all([
      supabaseAdmin.from("group_posts").select("user_id").eq("id", postId).maybeSingle(),
      parentCommentId ? supabaseAdmin.from("group_post_comments").select("user_id").eq("id", parentCommentId).maybeSingle() : Promise.resolve({ data: null }),
      personName(commenterId),
    ]);
    const href = groupId ? `${groupHref(groupId)}&post=${postId}` : "/?section=communities";
    const parentAuthor = (parent.data?.user_id as string | undefined) ?? null;
    if (parentAuthor) {
      await notify([parentAuthor], { kind: "reply", title: `${name} replied to your comment`, href, actorId: commenterId, groupId, dedupeKey: `reply:${commentId}` });
    }
    const postAuthor = (post?.user_id as string | undefined) ?? null;
    if (postAuthor && postAuthor !== parentAuthor) {
      await notify([postAuthor], { kind: "reply", title: `${name} commented on your post`, href, actorId: commenterId, groupId, dedupeKey: `reply:${commentId}` });
    }
  });

/** A post is held for review: the community's moderators. */
export const notifyPostPending = (groupId: string, postId: string, authorId: string) =>
  safely(async () => {
    const [mods, community, name] = await Promise.all([communityModerators(groupId), groupName(groupId), personName(authorId)]);
    await notify(mods, {
      kind: "post_pending",
      title: `${name}'s post is waiting for approval`,
      body: `In ${community}.`,
      href: `${groupHref(groupId)}&post=${postId}`,
      actorId: authorId,
      groupId,
      dedupeKey: `post_pending:${postId}`,
    });
  });

/** A held post was decided: its author. */
export const notifyPostModerated = (groupId: string, postId: string, moderatorId: string, approved: boolean) =>
  safely(async () => {
    const [{ data: post }, community] = await Promise.all([supabaseAdmin.from("group_posts").select("user_id").eq("id", postId).maybeSingle(), groupName(groupId)]);
    if (!post?.user_id) return;
    await notify([post.user_id as string], {
      kind: "post_moderated",
      title: approved ? `Your post in ${community} is live` : `Your post in ${community} wasn't approved`,
      body: approved ? "Everyone in the community can see it now." : "A moderator declined it. You can post again.",
      href: approved ? `${groupHref(groupId)}&post=${postId}` : groupHref(groupId),
      actorId: moderatorId,
      groupId,
      dedupeKey: `post_moderated:${postId}`,
    });
  });

/** Someone asked to join a private community: its moderators. */
export const notifyJoinRequest = (groupId: string, requesterId: string) =>
  safely(async () => {
    const [mods, community, name] = await Promise.all([communityModerators(groupId), groupName(groupId), personName(requesterId)]);
    await notify(mods, {
      kind: "join_request",
      title: `${name} asked to join ${community}`,
      body: "Accept or decline it in Manage.",
      href: `${groupHref(groupId)}&tab=manage`,
      actorId: requesterId,
      groupId,
      // One per request: asking again after a decline is a new request (the day keeps a double-submit to one).
      dedupeKey: `join_request:${groupId}:${requesterId}:${new Date().toISOString().slice(0, 10)}`,
    });
  });

/** A join request was decided: the person who asked. */
export const notifyJoinDecision = (groupId: string, targetId: string, moderatorId: string, approved: boolean) =>
  safely(async () => {
    const community = await groupName(groupId);
    await notify([targetId], {
      kind: "join_decision",
      title: approved ? `You're in: ${community}` : `${community} declined your request`,
      body: approved ? "You can post, predict and see the league now." : null,
      href: approved ? groupHref(groupId) : "/?section=communities",
      actorId: moderatorId,
      groupId,
      dedupeKey: `join_decision:${groupId}:${targetId}:${new Date().toISOString().slice(0, 16)}`,
    });
  });

const ROLE_NAME: Record<string, string> = { admin: "an admin", moderator: "a moderator", member: "a member" };

/** A member's role changed: that member. */
export const notifyRoleChanged = (groupId: string, targetId: string, actorId: string, newRole: string) =>
  safely(async () => {
    const community = await groupName(groupId);
    await notify([targetId], {
      kind: "role_changed",
      title: `You're now ${ROLE_NAME[newRole] ?? newRole} of ${community}`,
      body: newRole === "member" ? null : "You can review posts and join requests there.",
      href: groupHref(groupId),
      actorId,
      groupId,
    });
  });
