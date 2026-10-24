import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getSiteAdmin } from "@/lib/siteAdmin";
import { limitRequest } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyProblemReport } from "@/lib/notificationEvents";
import { isProblemKind, pageFromUrl, problemKindLabel, screenshotError, validateReport } from "@/lib/problemReports";

/** "Report a problem": signed-in people only. Multipart, so a screenshot can come along; it's checked again here
 * (type and 1 MB) and kept in the row as a data URL. The site's admins are told. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "problemReport", session.uid);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a form." }, { status: 400 });
  let context: unknown = null;
  try {
    context = JSON.parse(String(form.get("context") ?? "null"));
  } catch {
    // Context is a nicety: a report without it is still a report.
  }
  const report = validateReport({ kind: form.get("kind"), description: form.get("description"), context });
  if ("error" in report) return NextResponse.json({ error: report.error }, { status: 400 });

  let screenshot: string | null = null;
  const file = form.get("screenshot");
  if (file instanceof File && file.size > 0) {
    const problem = screenshotError(file);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    screenshot = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  }

  const page = pageFromUrl(report.context.url);
  const { data, error } = await supabaseAdmin
    .from("problem_reports")
    .insert({ user_id: session.uid, kind: report.kind, description: report.description, page, context: report.context, screenshot })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't send the report." }, { status: 500 });

  await notifyProblemReport({ id: data.id as string, kindLabel: problemKindLabel(report.kind), description: report.description, page }, session.uid);
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

/** The reports, newest first, for the site's admins only: `?status=open|resolved` and `?kind=` narrow it. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await getSiteAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const params = new URL(request.url).searchParams;
  let query = supabaseAdmin
    .from("problem_reports")
    .select("id, user_id, kind, description, page, context, screenshot, status, created_at, reporter:profiles(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);
  const status = params.get("status");
  if (status === "open" || status === "resolved") query = query.eq("status", status);
  const kind = params.get("kind");
  if (isProblemKind(kind)) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Couldn't load reports." }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}
