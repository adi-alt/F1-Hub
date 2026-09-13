// The Communities vocabulary: what kinds of community exist, which modules each one turns on by
// default, and what you're allowed to post in it.
//
// PURE ON PURPOSE - no imports from @/lib/supabase/*, no server-only dependencies. Both the server
// (service layer, route handlers) and the browser (create flow, community nav, composer) need this
// exact vocabulary, and importing it from groupPredictions.ts/groups.ts would drag nodemailer into
// a client bundle and crash it - the same trap groupPredictionTypes.ts already exists to dodge.
//
// NAMING: user-facing language is "community" everywhere; the database, tables, API routes and
// service functions all still say "group" and deliberately keep saying it (see
// supabase/migrations/20260911_communities.sql). This file is the seam between those two.

/** `groups.community_type`. Decides which modules a community starts with and what its composer
 * offers - never what it's permitted to store, so re-typing one later loses nothing. */
export type CommunityType = "general" | "f1" | "prediction_league" | "private_circle";

/** `groups.visibility`. 'hidden' communities are invite-only AND absent from search/recommendations
 * (unlike 'private', which is still discoverable and can be requested). */
export type CommunityVisibility = "public" | "private" | "hidden";

/** A module is a tab. Every one listed here is backed by real data that already exists:
 *
 *   feed         group_posts
 *   predictions  group_predictions / group_prediction_entries
 *   leaderboard  group_race_scores + prediction points
 *   media        group_posts where media_url is not null (a view over the feed, not a new table)
 *   members      group_members
 *   about        the groups row itself
 *
 * There is deliberately NO `events` module. It would need its own table plus RSVPs, and a tab that
 * renders an empty promise is the "broken generic UI" this redesign is meant to eliminate. Add it
 * here the day the table exists, not before. */
export type CommunityModule = "feed" | "predictions" | "leaderboard" | "media" | "members" | "about";

/** What a post *is* (`group_posts.kind`), separate from its moderation `status`.
 * No 'poll' - see the migration's own note on why. */
export type PostKind = "discussion" | "question" | "race_discussion" | "prediction";

// ---------------------------------------------------------------- community types

export type CommunityTypeMeta = {
  value: CommunityType;
  label: string;
  tagline: string;
  /** Concrete examples, shown on the create-flow cards so the choice isn't abstract. */
  examples: string[];
  /** Whether this type is inherently about Formula 1. Drives whether F1-only affordances (race
   * pickers, driver pickers, prediction rounds) are even offered - never forced onto the rest. */
  f1: boolean;
};

export const COMMUNITY_TYPES: CommunityTypeMeta[] = [
  {
    value: "general",
    label: "General Community",
    tagline: "Talk about anything you care about.",
    examples: ["Photography", "Gaming", "Travel", "Students"],
    f1: false,
  },
  {
    value: "f1",
    label: "F1 Community",
    tagline: "Race discussions, drivers, teams and events.",
    examples: ["Ferrari Tifosi", "McLaren Fans", "Strategy Talk"],
    f1: true,
  },
  {
    value: "prediction_league",
    label: "Prediction League",
    tagline: "Compete with friends and predict outcomes.",
    examples: ["Office League", "Championship Predictions"],
    f1: true,
  },
  {
    value: "private_circle",
    label: "Private Circle",
    tagline: "A smaller invite-only space.",
    examples: ["Friends", "Study group", "Travel group"],
    f1: false,
  },
];

const TYPE_BY_VALUE = new Map(COMMUNITY_TYPES.map((t) => [t.value, t]));

/** Falls back to General for an unrecognized value rather than throwing - a community row written
 * by a newer deploy must never be able to blank out an older client's page. */
export function communityTypeMeta(type: string | null | undefined): CommunityTypeMeta {
  return TYPE_BY_VALUE.get((type ?? "") as CommunityType) ?? COMMUNITY_TYPES[0];
}

export function isF1Type(type: string | null | undefined): boolean {
  return communityTypeMeta(type).f1;
}

// ---------------------------------------------------------------- modules

export const MODULE_LABELS: Record<CommunityModule, string> = {
  feed: "Feed",
  predictions: "Predictions",
  leaderboard: "Leaderboard",
  media: "Media",
  members: "Members",
  about: "About",
};

export const MODULE_DESCRIPTIONS: Record<CommunityModule, string> = {
  feed: "Discussions, questions and replies.",
  predictions: "Race prediction rounds members enter with points.",
  leaderboard: "Standings from prediction results.",
  media: "Images and video shared in this community.",
  members: "Who's here, and their roles.",
  about: "What this community is and who runs it.",
};

/** Structural, not preferences: a community with no feed, no member list and no identity isn't a
 * community. These are never offered as toggles and can't be switched off. */
export const REQUIRED_MODULES: CommunityModule[] = ["feed", "members", "about"];

/** Which modules a type starts with. Order here is tab order. */
const DEFAULT_MODULES: Record<CommunityType, CommunityModule[]> = {
  general: ["feed", "media", "members", "about"],
  f1: ["feed", "predictions", "leaderboard", "media", "members", "about"],
  prediction_league: ["feed", "predictions", "leaderboard", "members", "about"],
  private_circle: ["feed", "media", "members", "about"],
};

/** Canonical tab order, independent of how a `features` object happens to be keyed. */
const MODULE_ORDER: CommunityModule[] = ["feed", "predictions", "leaderboard", "media", "members", "about"];

/** F1-only modules are never enabled on a non-F1 community, whatever `features` claims - that's
 * the "do not force race/driver/prediction UI onto a Photography community" rule, enforced in one
 * place rather than re-checked at every call site. */
const F1_ONLY_MODULES: CommunityModule[] = ["predictions", "leaderboard"];

/** `groups.features` as stored: a sparse override map. `{}` (the column default) means "use this
 * type's defaults", so re-typing a community actually changes its shape, and adding a new module
 * to DEFAULT_MODULES above reaches every existing community without a backfill. */
export type CommunityFeatures = Partial<Record<CommunityModule, boolean>>;

/** The modules a community actually shows, in tab order. The single source of truth for
 * navigation, for the composer's post kinds, and for what Manage offers to toggle. */
export function resolveModules(type: string | null | undefined, features: unknown): CommunityModule[] {
  const meta = communityTypeMeta(type);
  const defaults = new Set(DEFAULT_MODULES[meta.value]);
  const overrides = (features && typeof features === "object" && !Array.isArray(features) ? features : {}) as CommunityFeatures;

  return MODULE_ORDER.filter((m) => {
    if (REQUIRED_MODULES.includes(m)) return true;
    if (!meta.f1 && F1_ONLY_MODULES.includes(m)) return false;
    const override = overrides[m];
    return typeof override === "boolean" ? override : defaults.has(m);
  });
}

/** What Manage > Features is allowed to offer for this type: every non-required module that isn't
 * ruled out by the type itself. */
export function toggleableModules(type: string | null | undefined): CommunityModule[] {
  const meta = communityTypeMeta(type);
  return MODULE_ORDER.filter((m) => !REQUIRED_MODULES.includes(m) && (meta.f1 || !F1_ONLY_MODULES.includes(m)));
}

export function hasModule(type: string | null | undefined, features: unknown, module: CommunityModule): boolean {
  return resolveModules(type, features).includes(module);
}

// ---------------------------------------------------------------- post kinds

export const POST_KIND_LABELS: Record<PostKind, string> = {
  discussion: "Discussion",
  question: "Question",
  race_discussion: "Race Discussion",
  prediction: "Prediction",
};

export const POST_KIND_HINTS: Record<PostKind, string> = {
  discussion: "Start a conversation.",
  question: "Ask the community something.",
  race_discussion: "Tie the thread to a specific race.",
  prediction: "Call a result and stand behind it.",
};

/** Only the kinds that make sense here - a Photography community never offers Race Discussion, and
 * Prediction only appears where the predictions module is actually on. */
export function postKindsFor(type: string | null | undefined, features: unknown): PostKind[] {
  const kinds: PostKind[] = ["discussion", "question"];
  if (!isF1Type(type)) return kinds;
  kinds.push("race_discussion");
  if (hasModule(type, features, "predictions")) kinds.push("prediction");
  return kinds;
}

// ---------------------------------------------------------------- topics

/** Deliberately broad and mostly non-F1: Communities is not an F1-only surface, and a topic list
 * that reads as "F1, F1, F1, Other" would quietly tell users the opposite. Free text is allowed
 * alongside these (the combobox accepts a custom value), so this is a starting vocabulary, not a
 * closed enum - which is also why `topic` is a plain text column with no check constraint. */
export const COMMUNITY_TOPICS: string[] = [
  "Formula 1",
  "Motorsport",
  "Sports",
  "Gaming",
  "Technology",
  "Coding",
  "Education",
  "Travel",
  "Music",
  "Photography",
  "Movies & TV",
  "Anime",
  "Food",
  "Fitness",
  "Lifestyle",
  "Students",
  "Other",
];

const MAX_TOPIC_LENGTH = 40;

/** Trims and length-caps a topic; returns null for anything empty. Custom topics are accepted, so
 * this is the only gate between user input and the column. */
export function normalizeTopic(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_TOPIC_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 24;

/** Lowercased, de-duplicated, capped. Tags are a search aid, not an identity - keeping them
 * normalized here means discovery can match them without per-query gymnastics. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = value.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

// ---------------------------------------------------------------- visibility

export type VisibilityMeta = {
  value: CommunityVisibility;
  label: string;
  description: string;
};

export const VISIBILITY_OPTIONS: VisibilityMeta[] = [
  {
    value: "public",
    label: "Public",
    description: "Anyone can discover and join this community.",
  },
  {
    value: "private",
    label: "Private",
    description: "Discoverable, but joining needs an invite or approval.",
  },
  {
    value: "hidden",
    label: "Hidden",
    description: "Not listed in search or recommendations. Invite only.",
  },
];

const VISIBILITY_LABELS: Record<CommunityVisibility, string> = { public: "Public", private: "Private", hidden: "Hidden" };

/** Every badge/label that shows a community's visibility. Exists because the old inline
 * `visibility === "public" ? "Public" : "Private"` ternaries scattered across the UI would have
 * silently mislabelled every Hidden community as "Private" the moment that value became storable. */
export function visibilityLabel(value: unknown): string {
  return isVisibility(value) ? VISIBILITY_LABELS[value] : "Private";
}

export function isVisibility(value: unknown): value is CommunityVisibility {
  return value === "public" || value === "private" || value === "hidden";
}

export function isCommunityType(value: unknown): value is CommunityType {
  return TYPE_BY_VALUE.has(value as CommunityType);
}

// ---------------------------------------------------------------- discovery ordering

/** How Discover orders results. Every one of these is computed from real, already-fetched fields -
 * there is no key here the data can't actually back. */
export type DiscoverSort = "recommended" | "trending" | "active" | "new" | "members";

export const DISCOVER_SORTS: { value: DiscoverSort; label: string; description: string }[] = [
  { value: "recommended", label: "Recommended", description: "Matched to topics you already follow" },
  { value: "trending", label: "Trending", description: "Most posts in the last 7 days" },
  { value: "active", label: "Most active", description: "Open predictions and recent posts" },
  { value: "new", label: "Newest", description: "Recently created" },
  { value: "members", label: "Most members", description: "Largest communities first" },
];

/** The fields sortDiscover actually reads. Structural rather than importing PublicGroupSummary, so
 * this module stays free of any dependency on the service layer. */
export type DiscoverSortable = {
  name: string;
  topic: string | null;
  createdAt: string;
  memberCount: number;
  activePredictions: number;
  weeklyPosts: number;
  isMember: boolean;
};

/** Pure, and tested - "recommended" in particular is the one key whose ordering isn't self-evident
 * from its name. Never mutates its input. */
export function sortDiscover<T extends DiscoverSortable>(rows: T[], sort: DiscoverSort, myTopics: Set<string> = new Set()): T[] {
  const activity = (g: T) => g.activePredictions + g.weeklyPosts;
  const out = [...rows];

  switch (sort) {
    case "members":
      return out.sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));
    case "new":
      return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case "trending":
      // Strictly last-7-days posts, a genuinely different question from "active" (which also counts
      // open prediction rounds - those can sit open for a fortnight without a soul posting).
      return out.sort((a, b) => b.weeklyPosts - a.weeklyPosts || b.memberCount - a.memberCount);
    case "active":
      return out.sort((a, b) => activity(b) - activity(a) || b.memberCount - a.memberCount);
    case "recommended":
    default:
      // Communities you're already in sink to the bottom (they don't need discovering), then a topic
      // you've shown interest in outranks one you haven't, then plain activity breaks the tie. With
      // no memberships this degrades to exactly the "active" ordering rather than inventing a
      // preference the data doesn't support.
      return out.sort((a, b) => {
        if (a.isMember !== b.isMember) return a.isMember ? 1 : -1;
        const aTopic = a.topic && myTopics.has(a.topic) ? 1 : 0;
        const bTopic = b.topic && myTopics.has(b.topic) ? 1 : 0;
        if (aTopic !== bTopic) return bTopic - aTopic;
        return activity(b) - activity(a) || b.memberCount - a.memberCount;
      });
  }
}

// ---------------------------------------------------------------- permissions

/** The four things a community can restrict. Each maps to a real enforcement point in the service
 * layer - there is no permission here that isn't actually checked before the write happens. */
export type PermissionAction = "post" | "comment" | "createPredictions" | "invite";

/** Who is allowed to do it. There is deliberately no "everyone" level: every one of these actions
 * already requires membership (requireMember runs first, in every case), so an "everyone" option
 * would be indistinguishable from "members" and would imply non-members could act. */
export type PermissionLevel = "members" | "moderators" | "admins";

export type CommunityPermissions = Partial<Record<PermissionAction, PermissionLevel>>;

export const PERMISSION_ACTIONS: { value: PermissionAction; label: string; description: string }[] = [
  { value: "post", label: "Create posts", description: "Start a new discussion in the feed" },
  { value: "comment", label: "Reply", description: "Comment on someone else's post" },
  { value: "createPredictions", label: "Create prediction rounds", description: "Open a new round for the community to enter" },
  { value: "invite", label: "Invite people", description: "Send email invitations to join" },
];

export const PERMISSION_LEVELS: { value: PermissionLevel; label: string }[] = [
  { value: "members", label: "All members" },
  { value: "moderators", label: "Moderators and admins" },
  { value: "admins", label: "Admins only" },
];

/** Defaults match exactly what the app enforced before permissions existed, so an existing
 * community with `permissions = {}` behaves identically to how it did yesterday. */
const DEFAULT_PERMISSIONS: Record<PermissionAction, PermissionLevel> = {
  post: "members",
  comment: "members",
  createPredictions: "admins",
  // Moderators+, matching the hardcoded rule inviteByEmail enforced before this column existed.
  // Getting this wrong would silently *loosen* an existing restriction on every community.
  invite: "moderators",
};

const ROLE_RANK: Record<string, number> = { member: 0, moderator: 1, admin: 2 };
const LEVEL_RANK: Record<PermissionLevel, number> = { members: 0, moderators: 1, admins: 2 };

export function permissionLevel(permissions: unknown, action: PermissionAction): PermissionLevel {
  const map = permissions && typeof permissions === "object" && !Array.isArray(permissions) ? (permissions as CommunityPermissions) : {};
  const value = map[action];
  return value === "members" || value === "moderators" || value === "admins" ? value : DEFAULT_PERMISSIONS[action];
}

/** The single gate. Compares the member's role rank against the required level's rank, so adding a
 * role or a level later doesn't mean revisiting four call sites. */
export function canDo(permissions: unknown, action: PermissionAction, role: string | null | undefined): boolean {
  if (!role) return false;
  return (ROLE_RANK[role] ?? -1) >= LEVEL_RANK[permissionLevel(permissions, action)];
}
