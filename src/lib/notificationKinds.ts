/** What can notify someone, how it's described in settings, and how it's delivered unless they choose otherwise.
 * Pure: shared by the server (deciding delivery) and the settings page (drawing the choices). */

export type NotificationKind = "prediction_result" | "new_round" | "reply" | "join_request" | "join_decision" | "post_pending" | "post_moderated" | "role_changed" | "invite" | "membership" | "photos_ready" | "race_reminder" | "race_results" | "problem_report";

export type Channel = "site" | "email";
export type ChannelPrefs = Record<Channel, boolean>;
export type NotificationPrefs = Partial<Record<NotificationKind, Partial<ChannelPrefs>>>;

export type KindMeta = {
  kind: NotificationKind;
  group: "Predictions" | "Conversations" | "Your communities";
  label: string;
  description: string;
  defaults: ChannelPrefs;
  moderatorsOnly?: boolean;
  /** The event brings its own email (an invitation is one), so only the site notice is a choice. */
  siteOnly?: boolean;
  /** Not listed in Settings: the race-weekend emails have their own switches there, and photo review is for site
   * admins. Each email's own "Stop emails like this" still turns it off. */
  hidden?: boolean;
};

export const NOTIFICATION_KINDS: KindMeta[] = [
  { kind: "prediction_result", group: "Predictions", label: "A prediction you entered is settled", description: "Whether you called it, and the points you won.", defaults: { site: true, email: true } },
  { kind: "new_round", group: "Predictions", label: "A new prediction round opens", description: "In a community you're in, with when it closes.", defaults: { site: true, email: false } },
  { kind: "reply", group: "Conversations", label: "Someone replies to you", description: "A comment on your post, or a reply to your comment.", defaults: { site: true, email: false } },
  { kind: "post_moderated", group: "Conversations", label: "Your post is approved or declined", description: "In a community where posts are reviewed first.", defaults: { site: true, email: false } },
  { kind: "invite", group: "Your communities", label: "You're invited to a community", description: "The invitation always arrives by email too.", defaults: { site: true, email: false }, siteOnly: true },
  { kind: "join_decision", group: "Your communities", label: "Your request to join is answered", description: "When a private community accepts or declines you.", defaults: { site: true, email: true } },
  { kind: "role_changed", group: "Your communities", label: "Your role changes", description: "When you're made a moderator or an admin, or it's taken away.", defaults: { site: true, email: true } },
  { kind: "join_request", group: "Your communities", label: "Someone asks to join", description: "A private community you admin or moderate.", defaults: { site: true, email: true }, moderatorsOnly: true },
  { kind: "membership", group: "Your communities", label: "You leave a community you didn't choose to", description: "When you're removed or banned, or a community you're in is deleted.", defaults: { site: true, email: true } },
  { kind: "race_reminder", group: "Predictions", label: "Before qualifying locks", description: "Picks and rounds still open.", defaults: { site: true, email: true }, hidden: true },
  { kind: "race_results", group: "Predictions", label: "When results land", description: "How your picks did.", defaults: { site: true, email: true }, hidden: true },
  { kind: "photos_ready", group: "Your communities", label: "Race photos are ready to choose", description: "Site admins only.", defaults: { site: true, email: true }, hidden: true },
  { kind: "problem_report", group: "Your communities", label: "Someone reports a problem", description: "Site admins only.", defaults: { site: true, email: true }, hidden: true },
  { kind: "post_pending", group: "Your communities", label: "A post is waiting for approval", description: "In a community you moderate.", defaults: { site: true, email: true }, moderatorsOnly: true },
];

const META = new Map(NOTIFICATION_KINDS.map((k) => [k.kind, k]));

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && META.has(value as NotificationKind);
}

/** Someone's choice for one kind, falling back channel by channel to the kind's defaults. */
export function channelsFor(prefs: unknown, kind: NotificationKind): ChannelPrefs {
  const { defaults, siteOnly } = META.get(kind)!;
  const own = prefs && typeof prefs === "object" ? (prefs as NotificationPrefs)[kind] : undefined;
  return { site: typeof own?.site === "boolean" ? own.site : defaults.site, email: !siteOnly && (typeof own?.email === "boolean" ? own.email : defaults.email) };
}

/** A settings change, validated: only known kinds and channels, only booleans. Null when nothing valid is in it. */
export function cleanPrefsPatch(input: unknown): NotificationPrefs | null {
  if (!input || typeof input !== "object") return null;
  const out: NotificationPrefs = {};
  for (const [kind, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isNotificationKind(kind) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const entry: Partial<ChannelPrefs> = {};
    if (typeof v.site === "boolean") entry.site = v.site;
    if (typeof v.email === "boolean") entry.email = v.email;
    if (Object.keys(entry).length) out[kind] = entry;
  }
  return Object.keys(out).length ? out : null;
}

/** What a notification needs for its inline actions: the row, as the notification centre lists it. */
export type ActionableNotification = { kind: NotificationKind; href: string | null; groupId: string | null; actor: { id: string } | null };

/** One inline button on a notification. With a `request`, pressing it calls that existing API route (which makes its
 * own permission checks); without one it only dismisses. `done` is what the notification says afterwards. */
export type NotificationAction = { label: string; done: string; primary?: boolean; request?: { url: string; body: Record<string, unknown> } };

const hrefParam = (href: string | null, name: string) => (href ? new URLSearchParams(href.split("?")[1] ?? "").get(name) : null);
const seg = encodeURIComponent;

/** Each kind's inline actions, worked out from its row. Another kind gets actions by adding an entry here. */
const ACTIONS: Partial<Record<NotificationKind, (n: ActionableNotification) => NotificationAction[] | null>> = {
  post_pending: ({ groupId, href }) => {
    const postId = hrefParam(href, "post");
    if (!groupId || !postId) return null;
    const url = `/api/groups/${seg(groupId)}/posts/${seg(postId)}/moderate`;
    return [
      { label: "Approve", done: "Approved", primary: true, request: { url, body: { action: "approve" } } },
      { label: "Decline", done: "Declined", request: { url, body: { action: "reject" } } },
    ];
  },
  join_request: ({ groupId, actor }) => {
    if (!groupId || !actor) return null;
    const url = `/api/groups/${seg(groupId)}/join-requests/${seg(actor.id)}`;
    return [
      { label: "Approve", done: "Approved", primary: true, request: { url, body: { decision: "approve" } } },
      { label: "Decline", done: "Declined", request: { url, body: { decision: "reject" } } },
    ];
  },
  // Declining an invitation needs no call: it simply goes unused and expires.
  invite: ({ groupId, href }) => {
    if (!groupId) return null;
    const token = hrefParam(href, "invite");
    return [
      { label: "Accept", done: "Joined", primary: true, request: { url: `/api/groups/${seg(groupId)}/join`, body: token ? { inviteToken: token } : {} } },
      { label: "Decline", done: "Declined" },
    ];
  },
};

export function notificationActions(n: ActionableNotification): NotificationAction[] {
  return ACTIONS[n.kind]?.(n) ?? [];
}
