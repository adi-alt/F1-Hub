import { supabaseAdmin } from "@/lib/supabase/admin";
import { communityMembers, communityModerators, notify } from "@/lib/supabase/notifications";
import { groupHref } from "@/lib/routes";
import { canDo } from "@/lib/communities";
import { predictionTypeLabels, type PredictionType } from "@/lib/groupPredictionTypes";

/**
 * Each event the site notifies about, raised from the one place in the code where it happens, with who should hear
 * about it decided here: the person it happened to, or a community's moderators, or its members - never whoever caused
 * it (notify drops the actor). Each also says what its email shows (lib/email/layout): the community, the words
 * someone wrote, the figures. Only what the recipient can already see on the site. Every function is
 * fire-and-forget safe: notify never throws, and the lookups here fall back to plain wording when a name can't be read.
 */

type Community = { name: string; avatarUrl: string | null; permissions: unknown };

async function community(groupId: string): Promise<Community> {
  const { data } = await supabaseAdmin.from("groups").select("name, avatar_url, permissions").eq("id", groupId).maybeSingle();
  return { name: (data?.name as string | undefined) ?? "your community", avatarUrl: (data?.avatar_url as string | null) ?? null, permissions: data?.permissions ?? null };
}

// People appear in emails by name only: avatars are drawn in the app, and provider photos are no longer used.
async function person(uid: string): Promise<{ name: string }> {
  const { data } = await supabaseAdmin.from("profiles").select("first_name, username").eq("id", uid).maybeSingle();
  return { name: (data?.first_name as string | null) ?? (data?.username as string | null) ?? "Someone" };
}

const contextOf = (c: Community) => ({ label: c.name, imageUrl: c.avatarUrl });

/** The start of what someone wrote, for a quote. */
const excerpt = (text: unknown, max = 280) => {
  const t = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t || undefined;
};

/** A guess or an answer as a line: a podium as "VER · NOR · LEC", a number or a code as itself. */
const pickText = (value: unknown): string => (Array.isArray(value) ? value.join(" · ") : value === null || value === undefined ? "-" : String(value));

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
    const [c, inviter] = await Promise.all([community(groupId), person(inviterId)]);
    await notify([userId], {
      kind: "invite",
      title: `${inviter.name} invited you to ${c.name}`,
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
    const [{ data: entries }, { data: prediction }, c] = await Promise.all([
      supabaseAdmin.from("group_prediction_entries").select("user_id, guess, points_awarded").eq("prediction_id", predictionId),
      supabaseAdmin.from("group_predictions").select("correct_answer").eq("id", predictionId).maybeSingle(),
      community(groupId),
    ]);
    const label = predictionTypeLabels[type] ?? "Prediction";
    await Promise.all(
      (entries ?? []).map((e) => {
        const points = (e.points_awarded as number | null) ?? 0;
        const won = points > 0;
        return notify([e.user_id as string], {
          kind: "prediction_result",
          title: won ? `You called it: ${label}, ${raceName}` : `Not this time: ${label}, ${raceName}`,
          body: won ? `+${points} points in ${c.name}.` : `Settled in ${c.name}. The next round is a fresh start.`,
          href: `${groupHref(groupId)}&tab=predictions`,
          groupId,
          dedupeKey: `prediction_result:${predictionId}`,
          email: {
            subject: won ? `${label}: you called it, +${points} pts` : `${label}: not this time`,
            preheader: `${raceName} · ${c.name}`,
            context: contextOf(c),
            eyebrow: `Round settled · ${raceName}`,
            big: won ? { value: `+${points}`, unit: "points" } : undefined,
            rows: [
              { label: "Your pick", value: pickText(e.guess) },
              { label: "Result", value: pickText(prediction?.correct_answer) },
            ],
            cta: "See the round",
            reason: `You entered this round in ${c.name}.`,
          },
        });
      }),
    );
  });

/** A new prediction round opened: everyone in the community but whoever opened it. */
export const notifyNewRound = (groupId: string, predictionId: string, creatorId: string, type: PredictionType, raceName: string) =>
  safely(async () => {
    const [members, c, { data: round }] = await Promise.all([communityMembers(groupId), community(groupId), supabaseAdmin.from("group_predictions").select("race_id").eq("id", predictionId).maybeSingle()]);
    const label = predictionTypeLabels[type] ?? "Prediction";
    // The lock is when qualifying starts: shown to each member in their own time.
    const { data: locks } = round?.race_id ? await supabaseAdmin.rpc("prediction_lock_times", { p_race_ids: [round.race_id] }) : { data: null };
    const lockAt = ((locks ?? []) as { lock_at: string | null }[])[0]?.lock_at ?? null;
    await notify(members, {
      kind: "new_round",
      title: `New round in ${c.name}: ${label}`,
      body: `${raceName}. Enter before it locks when qualifying starts.`,
      href: `${groupHref(groupId)}&tab=predictions`,
      actorId: creatorId,
      groupId,
      dedupeKey: `new_round:${predictionId}`,
      email: {
        subject: `New round in ${c.name}: ${label}`,
        preheader: `${raceName} · closes when qualifying starts`,
        context: contextOf(c),
        eyebrow: `New round · ${raceName}`,
        times: lockAt ? [{ label: "Closes", at: lockAt }] : undefined,
        cta: "Make your pick",
        reason: `You're a member of ${c.name}.`,
      },
    });
  });

/** A reply: the post's author hears about a comment on their post; a comment's author about a reply to it. */
export const notifyReply = (groupId: string | null, postId: string, commentId: string, commenterId: string, parentCommentId: string | null) =>
  safely(async () => {
    const [{ data: post }, parent, { data: comment }, commenter, c] = await Promise.all([
      supabaseAdmin.from("group_posts").select("user_id").eq("id", postId).maybeSingle(),
      parentCommentId ? supabaseAdmin.from("group_post_comments").select("user_id").eq("id", parentCommentId).maybeSingle() : Promise.resolve({ data: null }),
      supabaseAdmin.from("group_post_comments").select("content").eq("id", commentId).maybeSingle(),
      person(commenterId),
      groupId ? community(groupId) : Promise.resolve(null),
    ]);
    const href = groupId ? `${groupHref(groupId)}&post=${postId}` : "/communities";
    const quote = excerpt(comment?.content);
    const email = (what: string) => ({
      subject: quote ? `${commenter.name} ${what}: "${excerpt(quote, 50)}"` : `${commenter.name} ${what}`,
      preheader: quote ?? "",
      context: c ? contextOf(c) : undefined,
      eyebrow: "Reply",
      who: { name: commenter.name, sub: what },
      quote,
      cta: "Reply",
      reason: c ? `Someone replied to you in ${c.name}.` : "Someone replied to you.",
    });
    const parentAuthor = (parent.data?.user_id as string | undefined) ?? null;
    if (parentAuthor) {
      await notify([parentAuthor], { kind: "reply", title: `${commenter.name} replied to your comment`, href, actorId: commenterId, groupId, dedupeKey: `reply:${commentId}`, email: email("replied to your comment") });
    }
    const postAuthor = (post?.user_id as string | undefined) ?? null;
    if (postAuthor && postAuthor !== parentAuthor) {
      await notify([postAuthor], { kind: "reply", title: `${commenter.name} commented on your post`, href, actorId: commenterId, groupId, dedupeKey: `reply:${commentId}`, email: email("commented on your post") });
    }
  });

/** A post is held for review: the community's moderators. */
export const notifyPostPending = (groupId: string, postId: string, authorId: string) =>
  safely(async () => {
    const [mods, c, author, { data: post }] = await Promise.all([
      communityModerators(groupId),
      community(groupId),
      person(authorId),
      supabaseAdmin.from("group_posts").select("title, content").eq("id", postId).maybeSingle(),
    ]);
    await notify(mods, {
      kind: "post_pending",
      title: `${author.name}'s post is waiting for approval`,
      body: `In ${c.name}.`,
      href: `${groupHref(groupId)}&post=${postId}`,
      actorId: authorId,
      groupId,
      dedupeKey: `post_pending:${postId}`,
      email: {
        context: contextOf(c),
        eyebrow: "Waiting for approval",
        who: { name: author.name, sub: "wrote a post" },
        quote: excerpt([post?.title, post?.content].filter(Boolean).join(". ")),
        cta: "Review the post",
        reason: `You moderate ${c.name}, so posts waiting for approval come to you and the other moderators.`,
      },
    });
  });

/** A held post was decided: its author. */
export const notifyPostModerated = (groupId: string, postId: string, moderatorId: string, approved: boolean) =>
  safely(async () => {
    const [{ data: post }, c] = await Promise.all([supabaseAdmin.from("group_posts").select("user_id, title, content").eq("id", postId).maybeSingle(), community(groupId)]);
    if (!post?.user_id) return;
    await notify([post.user_id as string], {
      kind: "post_moderated",
      title: approved ? `Your post in ${c.name} is live` : `Your post in ${c.name} wasn't approved`,
      body: approved ? "Everyone in the community can see it now." : "A moderator declined it. You can post again.",
      href: approved ? `${groupHref(groupId)}&post=${postId}` : groupHref(groupId),
      actorId: moderatorId,
      groupId,
      dedupeKey: `post_moderated:${postId}`,
      email: {
        context: contextOf(c),
        eyebrow: approved ? "Post approved" : "Post declined",
        quote: excerpt([post.title, post.content].filter(Boolean).join(". ")),
        cta: approved ? "See your post" : `Open ${c.name}`,
        reason: `You posted in ${c.name}, where posts are reviewed first.`,
      },
    });
  });

/** Someone asked to join a private community: its moderators. */
export const notifyJoinRequest = (groupId: string, requesterId: string) =>
  safely(async () => {
    const [mods, c, requester, { data: request }] = await Promise.all([
      communityModerators(groupId),
      community(groupId),
      person(requesterId),
      supabaseAdmin.from("group_join_requests").select("message").eq("group_id", groupId).eq("user_id", requesterId).maybeSingle(),
    ]);
    const message = excerpt(request?.message);
    await notify(mods, {
      kind: "join_request",
      title: `${requester.name} asked to join ${c.name}`,
      body: message ? null : "Approve or decline the request.",
      href: `${groupHref(groupId)}&tab=manage`,
      actorId: requesterId,
      groupId,
      // One per request: asking again after a decline is a new request (the day keeps a double-submit to one).
      dedupeKey: `join_request:${groupId}:${requesterId}:${new Date().toISOString().slice(0, 10)}`,
      email: {
        preheader: message ? `"${message}"` : `Approve or decline it in ${c.name}`,
        context: contextOf(c),
        eyebrow: "Join request",
        who: { name: requester.name, sub: `wants to join ${c.name}` },
        quote: message,
        cta: "Review request",
        reason: `You run ${c.name}, so join requests come to you and the other moderators.`,
      },
    });
  });

/** A join request was decided: the person who asked. */
export const notifyJoinDecision = (groupId: string, targetId: string, moderatorId: string, approved: boolean) =>
  safely(async () => {
    const c = await community(groupId);
    await notify([targetId], {
      kind: "join_decision",
      title: approved ? `You're in: ${c.name}` : `${c.name} declined your request`,
      body: approved ? "You can post, predict and see the league now." : "You can still join with an invitation from a member.",
      href: approved ? groupHref(groupId) : "/communities",
      actorId: moderatorId,
      groupId,
      dedupeKey: `join_decision:${groupId}:${targetId}:${new Date().toISOString().slice(0, 16)}`,
      email: {
        context: contextOf(c),
        eyebrow: "Join request",
        cta: approved ? `Open ${c.name}` : "Find other communities",
        reason: `You asked to join ${c.name}.`,
      },
    });
  });

const ROLE_NAME: Record<string, string> = { admin: "an admin", moderator: "a moderator", member: "a member" };

/** A member's role changed: that member, told what the new role lets them do there. */
export const notifyRoleChanged = (groupId: string, targetId: string, actorId: string, newRole: string) =>
  safely(async () => {
    const [c, actor] = await Promise.all([community(groupId), person(actorId)]);
    const can = (action: "invite" | "createPredictions") => canDo(c.permissions, action, newRole);
    const abilities =
      newRole === "member"
        ? []
        : [
            ...(newRole === "admin" ? ["Change settings, roles and the cover"] : []),
            "Approve or decline join requests",
            "Approve or remove posts",
            ...(can("invite") ? ["Invite people"] : []),
            ...(can("createPredictions") ? ["Open prediction rounds"] : []),
          ];
    await notify([targetId], {
      kind: "role_changed",
      title: `You're now ${ROLE_NAME[newRole] ?? newRole} in ${c.name}`,
      body: newRole === "member" ? `${actor.name} changed your role.` : `${actor.name} made you ${ROLE_NAME[newRole] ?? newRole}.`,
      href: groupHref(groupId),
      actorId,
      groupId,
      email: {
        context: contextOf(c),
        eyebrow: "Your role",
        rows: abilities.map((a) => ({ label: a, value: "Yes" })),
        cta: `Open ${c.name}`,
        reason: `You're a member of ${c.name}.`,
      },
    });
  });

/** Removed or banned from a community: the person, once, without who did it or why, and nothing from inside it. */
export const notifyRemoved = (groupId: string, targetId: string, actorId: string, banned: boolean) =>
  safely(async () => {
    const c = await community(groupId);
    await notify([targetId], {
      kind: "membership",
      title: banned ? `You were removed from ${c.name} and can't rejoin` : `You were removed from ${c.name}`,
      body: banned
        ? "You can't see its posts or league any more, or join it again. Your points elsewhere aren't affected."
        : "You can't see its posts or league any more, and invitation links you made there stopped working. You can join again with a new invitation.",
      href: "/communities",
      actorId,
      dedupeKey: `membership:${groupId}:${new Date().toISOString().slice(0, 16)}`,
      email: {
        subject: `You're no longer in ${c.name}`,
        context: { label: c.name, imageUrl: c.avatarUrl },
        eyebrow: "Membership",
        cta: "Find other communities",
        reason: "Sent once, when your membership changed.",
      },
    });
  });

/** A community was deleted: everyone who was in it but whoever deleted it. Its name is passed in, the row is gone. */
export const notifyCommunityDeleted = (name: string, memberIds: string[], actorId: string) =>
  safely(async () => {
    await notify(memberIds, {
      kind: "membership",
      title: `${name} was deleted`,
      body: "Its posts, prediction rounds and league are gone. Points you won there stay yours.",
      href: "/communities",
      actorId,
      dedupeKey: `deleted:${name}:${new Date().toISOString().slice(0, 16)}`,
      email: { subject: `${name} was deleted`, context: { label: name }, eyebrow: "Membership", cta: "Find other communities", reason: `You were a member of ${name}.` },
    });
  });

/** New race photos are waiting to be chosen: the site's admins. */
export const notifyPhotosReady = (pending: { raceName: string; count: number }[]) =>
  safely(async () => {
    const { data: admins } = await supabaseAdmin.from("profiles").select("id").eq("role", "admin");
    const total = pending.reduce((n, p) => n + p.count, 0);
    if (!total) return;
    await notify((admins ?? []).map((a) => a.id as string), {
      kind: "photos_ready",
      title: `${total} race ${total === 1 ? "photo is" : "photos are"} waiting for you`,
      body: "Choose the ones the race pages show.",
      href: "/admin/race-photos",
      dedupeKey: `photos_ready:${new Date().toISOString().slice(0, 10)}`,
      email: {
        eyebrow: "Race photos",
        rows: pending.slice(0, 8).map((p) => ({ label: p.raceName, value: `${p.count}` })),
        cta: "Choose photos",
        reason: "You're an admin of Apex F1 Hub.",
      },
    });
  });

/** Someone reported a problem: the site's admins. */
export const notifyProblemReport = (report: { id: string; kindLabel: string; description: string; page: string | null }, reporterId: string) =>
  safely(async () => {
    const { data: admins } = await supabaseAdmin.from("profiles").select("id").eq("role", "admin");
    await notify((admins ?? []).map((a) => a.id as string), {
      kind: "problem_report",
      title: `New problem report: ${report.kindLabel}`,
      body: report.description.slice(0, 200),
      href: "/models#problem-reports",
      actorId: reporterId,
      dedupeKey: `problem_report:${report.id}`,
      email: {
        eyebrow: "Problem report",
        rows: report.page ? [{ label: "Page", value: report.page }] : undefined,
        cta: "Open reports",
        reason: "You're an admin of Apex F1 Hub.",
      },
    });
  });
