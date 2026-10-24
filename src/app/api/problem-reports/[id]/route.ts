import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getSiteAdmin } from "@/lib/siteAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Resolve or reopen a problem report: site admins only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await getSiteAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  if (body.status !== "open" && body.status !== "resolved") return NextResponse.json({ error: "Status must be open or resolved." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("problem_reports").update({ status: body.status }).eq("id", id).select("id, status").maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't update the report." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
