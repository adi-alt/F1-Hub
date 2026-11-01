import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { requireMember } from "@/lib/supabase/groups";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { triageModerationReports, type ReportForTriage } from "@/lib/ai/moderationTriage";
import { limitRequest } from "@/lib/rateLimit";

export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = await limitRequest(_req, "aiBurst", session.uid);
  if (limited) return limited;

  const { id: groupId } = await params;
  const role = await requireMember(groupId, session.uid);
  if (role === "member") {
    return NextResponse.json({ error: "Only admins and moderators can access report triage." }, { status: 403 });
  }

  try {
    // 1. Fetch open reports
    const { data: reports, error: reportsErr } = await supabaseAdmin
      .from("group_post_reports")
      .select("id, post_id, comment_id, reason, created_at")
      .eq("group_id", groupId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(25);

    if (reportsErr) throw reportsErr;
    if (!reports || reports.length === 0) {
      return NextResponse.json({
        triage: {
          totalReports: 0,
          highSeverityCount: 0,
          summary: "No open reports to triage.",
          items: [],
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // 2. Fetch excerpts for posts and comments
    const postIds = reports.map((r) => r.post_id).filter(Boolean);
    const commentIds = reports.map((r) => r.comment_id).filter(Boolean);

    const [{ data: posts }, { data: comments }] = await Promise.all([
      postIds.length > 0
        ? supabaseAdmin.from("group_posts").select("id, title, content").in("id", postIds)
        : Promise.resolve({ data: [] }),
      commentIds.length > 0
        ? supabaseAdmin.from("group_post_comments").select("id, content").in("id", commentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const postMap = new Map((posts ?? []).map((p) => [p.id as string, `${p.title ? p.title + ": " : ""}${p.content}`]));
    const commentMap = new Map((comments ?? []).map((c) => [c.id as string, c.content as string]));

    const reportsForTriage: ReportForTriage[] = reports.map((r) => {
      const isComment = Boolean(r.comment_id);
      const targetExcerpt = isComment
        ? commentMap.get(r.comment_id as string) ?? "(Comment deleted or missing)"
        : postMap.get(r.post_id as string) ?? "(Post deleted or missing)";

      return {
        id: r.id as string,
        targetType: isComment ? "comment" : "post",
        targetExcerpt,
        reason: r.reason as string,
        createdAt: r.created_at as string,
      };
    });

    const requestId = `trg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const triage = await triageModerationReports(reportsForTriage, requestId);

    return NextResponse.json({ triage });
  } catch (err) {
    console.error("POST /api/groups/[id]/reports/triage:", err);
    return NextResponse.json({ error: "Could not triage reports" }, { status: 500 });
  }
}
