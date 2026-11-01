import { supabaseAdmin } from "@/lib/supabase/admin";
import { chatWithProviderFallback } from "@/lib/ai/providerFallback";
import { APEX_BOT_USER_ID, ensureApexBotProfile } from "./apexBot";
import { notifyReply } from "@/lib/notificationEvents";
import { logAIError } from "./telemetry";

const COPILOT_SYSTEM_PROMPT = `You are Apex, F1 HUB's Official AI Discussion & Race Strategy Copilot.
A motorsport fan mentioned you (@Apex) in an F1 discussion thread.
Answer their question, debate, or claim directly with sharp motorsport analysis, strategy insights, and accurate Formula 1 knowledge.

Guidelines:
1. VOICE: Sharp race engineer / strategy analyst tone. Factual, authoritative, insightful, yet engaging.
2. BREVITY: Keep your reply concise (typically 2 to 4 sentences, under 150 words). Fans read on mobile.
3. MOTORSPORT SUBSTANCE: Reference real concepts where relevant: tire degradation, telemetry deltas, undercut/overcut margins, dirty air, DRS trains, setup balances, or historical parallels.
4. NO FLUFF: Do not use generic greetings like "Hello @user!" or sign-offs like "Cheers, Apex". Jump straight into the racing answer.
5. GROUNDING: Never hallucinate driver records or race results. If a scenario is hypothetical, analyze the tactical trade-offs.
6. NO MARKDOWN HEADERS: Plain paragraphs with bolding or inline numbers are fine.`;

export function shouldTriggerApexCopilot(content: string, authorId: string): boolean {
  if (authorId === APEX_BOT_USER_ID) return false;
  // Case-insensitive match for @apex as a distinct mention
  return /(?:^|\s)@apex\b/i.test(content);
}

export async function triggerApexCommentReply(
  groupId: string | null,
  postId: string,
  triggeringCommentId: string,
  userCommentText: string,
  userAuthorId: string
): Promise<string | null> {
  const requestId = `copilot_${Date.now()}`;
  try {
    await ensureApexBotProfile();

    // 1. Fetch post context
    const { data: post } = await supabaseAdmin
      .from("group_posts")
      .select("title, content, kind")
      .eq("id", postId)
      .maybeSingle();

    // 2. Fetch author profile name for personalization
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", userAuthorId)
      .maybeSingle();

    const authorName = userProfile?.display_name ?? userProfile?.username ?? "Fan";

    // 3. Assemble prompt
    const postContext = post ? `POST TOPIC: "${post.title || "(Untitled post)"}"\nPOST CONTENT: "${post.content}"` : "";
    const userPrompt = [
      postContext,
      `USER (${authorName}) COMMENT: "${userCommentText}"`,
      `Respond directly as Apex to ${authorName}'s point.`,
    ].filter(Boolean).join("\n\n");

    const result = await chatWithProviderFallback(
      [
        { role: "system", content: COPILOT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      null,
      {
        maxTokens: 350,
        temperature: 0.6,
      },
      requestId
    );

    const replyText = result.response.content?.trim() ?? "";
    if (!replyText) return null;

    // 4. Insert comment into database
    const { data: comment, error } = await supabaseAdmin
      .from("group_post_comments")
      .insert({
        post_id: postId,
        user_id: APEX_BOT_USER_ID,
        content: replyText,
        parent_comment_id: triggeringCommentId,
      })
      .select("id")
      .single();

    if (error || !comment) {
      logAIError(requestId, "copilot_comment_insert_failed", error?.message ?? "No data returned");
      return null;
    }

    // 5. Notify the user that Apex replied to their comment
    await notifyReply(groupId, postId, comment.id as string, APEX_BOT_USER_ID, triggeringCommentId);

    return comment.id as string;
  } catch (err) {
    logAIError(requestId, "copilot_execution_failed", String(err));
    return null;
  }
}
