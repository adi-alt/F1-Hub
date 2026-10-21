/** What can notify someone, how it's described in settings, and how it's delivered unless they choose otherwise.
 * Pure: shared by the server (deciding delivery) and the settings page (drawing the choices). */

export type NotificationKind = "prediction_result" | "new_round" | "reply" | "join_request" | "join_decision" | "post_pending" | "post_moderated" | "role_changed" | "invite";

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
