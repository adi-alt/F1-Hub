import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getTransporter } from "@/lib/otp";
import { singleLine } from "@/lib/html";
import { formatWhen, renderEmail, type EmailContent } from "@/lib/email/layout";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { channelsFor, cleanPrefsPatch, type NotificationKind, type NotificationPrefs } from "@/lib/notificationKinds";

export type NotificationEvent = {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** A site path (starts with "/"): where the notification opens. */
  href?: string | null;
  actorId?: string | null;
  groupId?: string | null;
  /** Makes the event notify each person once, however many times the code raising it runs. */
  dedupeKey?: string | null;
  /** What the email shows beyond the title and body: the community, a quote, the figures. The title is the email's
   * title, the body its text, and `href` its button. */
  email?: Partial<Pick<EmailContent, "subject" | "preheader" | "context" | "eyebrow" | "who" | "big" | "quote" | "rows" | "reason">> & {
    cta?: string;
    /** Moments shown as rows in each reader's own time zone ("Closes · Sat 25 Oct, 23:00 GMT+5:30"). */
    times?: { label: string; at: string }[];
  };
};

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
  actor: { name: string; avatarUrl: string | null } | null;
};

/** PostgREST's "no such table": the notifications migration isn't applied yet, which reads as an empty centre. */
const missingTable = (error: { code?: string } | null) => error?.code === "PGRST205" || error?.code === "42P01";

/**
 * Tells people something happened, the way each of them chose for this kind (site, email, both or neither):
 * a notification-centre row for those who want it on the site, an email for those who want it by email. Never the
 * person who caused it. Never throws: a notification failing must not fail what triggered it - the post is still
 * posted, the round still settled - so failures are logged and swallowed. Emails go after the response (`after`).
 */
export async function notify(userIds: readonly string[], event: NotificationEvent): Promise<void> {
  try {
    const recipients = [...new Set(userIds)].filter((id) => id && id !== event.actorId);
    if (recipients.length === 0) return;
    const { data: people, error } = await supabaseAdmin.from("profiles").select("id, email, notification_prefs").in("id", recipients);
    if (error) throw new Error(error.message);

    const site = (people ?? []).filter((p) => channelsFor(p.notification_prefs, event.kind).site);
    const email = (people ?? []).filter((p) => channelsFor(p.notification_prefs, event.kind).email && typeof p.email === "string" && p.email);

    // A site row also records that an email went, so a person who wants email only still gets a row (read) for the
    // dedupe key: the same event can never email them twice.
    const rows = [...new Set([...site, ...email].map((p) => p.id as string))].map((id) => ({
      user_id: id,
      kind: event.kind,
      title: singleLine(event.title, 200),
      body: event.body ? event.body.slice(0, 500) : null,
      href: event.href ?? null,
      actor_id: event.actorId ?? null,
      group_id: event.groupId ?? null,
      dedupe_key: event.dedupeKey ?? null,
      read_at: site.some((p) => p.id === id) ? null : new Date().toISOString(),
    }));
    if (rows.length === 0) return;
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("notifications")
      .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id, user_id");
    if (insertError) throw new Error(insertError.message);

    // Only people whose row is new this time are emailed: a duplicate event inserts nothing and emails no one.
    const fresh = new Set((inserted ?? []).map((r) => r.user_id as string));
    const toEmail = email.filter((p) => fresh.has(p.id as string));
    if (toEmail.length === 0 || !process.env.MAIL_FROM) return;
    const send = () => sendEmails(toEmail.map((p) => ({ id: p.id as string, email: p.email as string })), event, inserted ?? []);
    try {
      after(send);
    } catch {
      // Outside a request (a script, a test): send now.
      await send();
    }
  } catch (err) {
    console.error(`notify(${event.kind}) failed:`, err instanceof Error ? err.message : err);
  }
}

/** Each person's email, in the shared design (lib/email/layout), with their own one-click way to stop this kind. */
async function sendEmails(to: { id: string; email: string }[], event: NotificationEvent, rows: { id: string; user_id: string }[]) {
  const transporter = getTransporter();
  const e = event.email ?? {};
  // Read on its own and allowed to fail: a missing zone (or column) only means the time is given in UTC.
  const zones = new Map<string, string | null>();
  if (e.times?.length) {
    const { data } = await supabaseAdmin.from("profiles").select("id, time_zone").in("id", to.map((p) => p.id));
    for (const row of data ?? []) zones.set(row.id as string, (row.time_zone as string | null) ?? null);
  }
  await Promise.all(
    to.map(async (person) => {
      try {
        const mail = renderEmail({
          subject: e.subject ?? event.title,
          preheader: e.preheader ?? event.body ?? event.title,
          context: e.context,
          eyebrow: e.eyebrow,
          title: event.title,
          text: event.body ?? undefined,
          who: e.who,
          big: e.big,
          quote: e.quote,
          rows: [...(e.times ?? []).map((t) => ({ label: t.label, value: formatWhen(t.at, zones.get(person.id)) })), ...(e.rows ?? [])],
          cta: event.href ? { label: e.cta ?? "Open on Apex F1 Hub", href: event.href } : undefined,
          reason: e.reason ?? "You get this because of your notification settings.",
          unsubscribeUrl: unsubscribeUrl(person.id, event.kind),
          settingsLink: true,
        });
        await transporter.sendMail({ from: `"Apex F1 Hub" <${process.env.MAIL_FROM}>`, to: person.email, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers });
        const row = rows.find((r) => r.user_id === person.id);
        if (row) await supabaseAdmin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
      } catch (err) {
        console.error(`notification email to ${person.id} failed:`, err instanceof Error ? err.message : err);
      }
    }),
  );
}

/** The people who run a community (its admins and moderators): who hears about join requests and pending posts. */
export async function communityModerators(groupId: string): Promise<string[]> {
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("user_id").eq("group_id", groupId).in("role", ["admin", "moderator"]));
  if (error) throw new Error(`communityModerators(${groupId}): ${error.message}`);
  return (data ?? []).map((r) => r.user_id as string);
}

/** Everyone in a community: who hears about a new prediction round. */
export async function communityMembers(groupId: string): Promise<string[]> {
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("user_id").eq("group_id", groupId));
  if (error) throw new Error(`communityMembers(${groupId}): ${error.message}`);
  return (data ?? []).map((r) => r.user_id as string);
}

/** A person's notification centre, newest first, a page at a time (`before` is the last item's createdAt). */
export async function listNotifications(uid: string, { before, limit = 20 }: { before?: string | null; limit?: number } = {}): Promise<{ items: NotificationItem[]; unread: number }> {
  let query = supabaseAdmin.from("notifications").select("id, kind, title, body, href, created_at, read_at, actor_id").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit);
  if (before) query = query.lt("created_at", before);
  const [{ data, error }, unread] = await Promise.all([query, unreadCount(uid)]);
  if (missingTable(error)) return { items: [], unread: 0 };
  if (error) throw new Error(`listNotifications(${uid}): ${error.message}`);
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id as string | null).filter((x): x is string => !!x))];
  const actors = new Map<string, { name: string; avatarUrl: string | null }>();
  if (actorIds.length) {
    const { data: people } = await supabaseAdmin.from("profiles").select("id, first_name, username, avatar_url").in("id", actorIds);
    for (const p of people ?? []) actors.set(p.id as string, { name: (p.first_name as string | null) ?? (p.username as string | null) ?? "Someone", avatarUrl: (p.avatar_url as string | null) ?? null });
  }
  return {
    unread,
    items: (data ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as NotificationKind,
      title: r.title as string,
      body: (r.body as string | null) ?? null,
      href: (r.href as string | null) ?? null,
      createdAt: r.created_at as string,
      readAt: (r.read_at as string | null) ?? null,
      actor: r.actor_id ? (actors.get(r.actor_id as string) ?? null) : null,
    })),
  };
}

export async function unreadCount(uid: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).is("read_at", null);
  if (missingTable(error)) return 0;
  if (error) throw new Error(`unreadCount(${uid}): ${error.message}`);
  return count ?? 0;
}

/** Marks some (or, with no ids, all) of a person's notifications read. Only ever their own. */
export async function markNotificationsRead(uid: string, ids?: string[]): Promise<void> {
  let query = supabaseAdmin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
  if (ids?.length) query = query.in("id", ids.slice(0, 100));
  const { error } = await query;
  if (error) throw new Error(`markNotificationsRead(${uid}): ${error.message}`);
}

export async function getNotificationPrefs(uid: string): Promise<NotificationPrefs> {
  const { data, error } = await supabaseAdmin.from("profiles").select("notification_prefs").eq("id", uid).maybeSingle();
  if (error) throw new Error(`getNotificationPrefs(${uid}): ${error.message}`);
  return ((data?.notification_prefs as NotificationPrefs | null) ?? {}) as NotificationPrefs;
}

/** Merges a validated change into a person's settings. Returns the merged settings, or null for an invalid change. */
export async function updateNotificationPrefs(uid: string, patch: unknown): Promise<NotificationPrefs | null> {
  const clean = cleanPrefsPatch(patch);
  if (!clean) return null;
  const current = await getNotificationPrefs(uid);
  const merged: NotificationPrefs = { ...current };
  for (const [kind, value] of Object.entries(clean)) merged[kind as NotificationKind] = { ...(current[kind as NotificationKind] ?? {}), ...value };
  const { error } = await supabaseAdmin.from("profiles").update({ notification_prefs: merged }).eq("id", uid);
  if (error) throw new Error(`updateNotificationPrefs(${uid}): ${error.message}`);
  return merged;
}

/** Turns one kind of email off for a person (the "Stop emails like this" link). The race-weekend emails have their
 * own switches in Settings, so those are what it flips for them; everything else is that kind's email channel. */
export async function stopEmails(uid: string, kind: NotificationKind): Promise<void> {
  const flag = kind === "race_reminder" ? "notify_before_qualifying" : kind === "race_results" ? "notify_on_results" : null;
  if (flag) {
    const { error } = await supabaseAdmin.from("profiles").update({ [flag]: false }).eq("id", uid);
    if (error) throw new Error(`stopEmails(${uid}): ${error.message}`);
    return;
  }
  await updateNotificationPrefs(uid, { [kind]: { email: false } });
}
