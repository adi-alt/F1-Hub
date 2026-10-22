import { NextResponse } from "next/server";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";
import { emailOrigin, SETTINGS_PATH } from "@/lib/email/layout";
import { escapeHtml } from "@/lib/html";
import { NOTIFICATION_KINDS } from "@/lib/notificationKinds";
import { stopEmails } from "@/lib/supabase/notifications";

/**
 * "Stop emails like this", from an email's footer or the mail app's own unsubscribe button. A visit (GET) only asks,
 * because link scanners open every link in an email; turning the email off takes the POST: the button on that page,
 * or a mail app's one-click unsubscribe (List-Unsubscribe-Post). No sign-in: the signed token names the person and
 * the kind, and can only switch an email off.
 */
const kindLabel = (kind: string) => NOTIFICATION_KINDS.find((k) => k.kind === kind)?.label ?? "These emails";

function page(title: string, body: string, form?: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Apex F1 Hub</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#09090b linear-gradient(118deg,#09090b 6%,#27140f 22%,#0d111a 35%,#09090b 47%,#09090b 54%,#180f0d 67%,#101824 80%,#09090b 92%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f2f2f3;">
<main style="max-width:440px;width:100%;background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.1);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:16px;overflow:hidden;">
<div style="height:4px;background:#e10600;"></div>
<div style="padding:28px;">
<p style="margin:0;font-weight:700;font-size:15px;"><span style="display:inline-block;width:5px;height:16px;background:#e10600;border-radius:3px;vertical-align:-3px;margin-right:9px;"></span>Apex F1 Hub</p>
<h1 style="margin:22px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(title)}</h1>
<p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#b4b4bb;">${escapeHtml(body)}</p>
${form ?? ""}
<p style="margin:22px 0 0;font-size:13px;"><a href="${escapeHtml(`${emailOrigin()}${SETTINGS_PATH}`)}" style="color:#9a9aa2;">All email settings</a></p>
</div></main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const target = readUnsubscribeToken(token);
  if (!target) return page("This link doesn't work", "It may have been copied incompletely. You can turn emails off in your settings instead.");
  return page(
    "Stop these emails?",
    `"${kindLabel(target.kind)}" won't be emailed to you any more. You can turn it back on in your settings.`,
    `<form method="post" style="margin:22px 0 0;"><input type="hidden" name="t" value="${escapeHtml(token ?? "")}"><button type="submit" style="background:#e10600;color:#fff;border:0;border-radius:8px;padding:12px 20px;font:600 15px inherit;cursor:pointer;">Stop these emails</button></form>`,
  );
}

export async function POST(request: Request) {
  // A mail app's one-click unsubscribe posts to the link itself (token in the query); the page's button posts the form.
  const form = await request.formData().catch(() => null);
  const token = new URL(request.url).searchParams.get("t") ?? (form?.get("t") as string | null);
  const target = readUnsubscribeToken(token);
  if (!target) return page("This link doesn't work", "It may have been copied incompletely. You can turn emails off in your settings instead.");
  await stopEmails(target.userId, target.kind);
  return page("Done", `"${kindLabel(target.kind)}" won't be emailed to you any more. You can turn it back on in your settings.`);
}
