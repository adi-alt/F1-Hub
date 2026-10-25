/**
 * The site's URL shape: every section is a real path, and an entity is a path under it - `/season/2026`,
 * `/season/2026/british-grand-prix`, `/archive/teams/ferrari`, `/profile/notifications`. Page state that isn't an
 * entity (a tab, a filter, a community's `id`) stays in the query.
 *
 * The URLs before this were `/?section=<name>&...`, and before those path-style ones (/race?..., /groups, ...).
 * src/proxy.ts answers both with a permanent redirect to today's path (cleanUrlFor). Pure, so the proxy, the link
 * helpers and the tests share one definition.
 */

export const SECTION_PATHS = {
  season: "/season",
  circuits: "/circuits",
  archive: "/archive",
  communities: "/communities",
  users: "/users",
  models: "/models",
  profile: "/profile",
  photos: "/admin/race-photos",
} as const;

export type Section = keyof typeof SECTION_PATHS;

const isSection = (value: string | null | undefined): value is Section => !!value && Object.hasOwn(SECTION_PATHS, value);

type Params = Record<string, string | number | null | undefined>;

// The query keys that become path segments, per section, in order: [key, the segment before its value].
const ARCHIVE_ENTITIES: [string, string][] = [["driver", "drivers"], ["team", "teams"], ["circuit", "circuits"]];

/** A section's URL: its path, an entity's segments after it, then the remaining params as the query, in order. */
export function sectionHref(section: Section, params: Params = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const segments: string[] = [SECTION_PATHS[section]];
  const take = (key: string, before?: string) => {
    const value = q.get(key);
    q.delete(key);
    if (before) segments.push(before);
    segments.push(encodeURIComponent(value!));
  };

  if (section === "season" && q.has("year")) {
    take("year");
    // An old numeric `race=18` is the season page's race window, not a race page: it stays in the query.
    if (q.has("race") && !/^\d+$/.test(q.get("race")!)) take("race");
  } else if (section === "circuits" && q.has("circuit")) take("circuit");
  else if (section === "profile" && q.has("tab")) take("tab");
  else if (section === "archive") {
    const entity = ARCHIVE_ENTITIES.find(([key]) => q.has(key));
    if (entity) take(entity[0], entity[1]);
    else if (q.has("year")) take("year");
  }
  const query = q.toString();
  return `${segments.join("/")}${query ? `?${query}` : ""}`;
}

/** The old `/?section=` form a legacy path-style URL meant, with its query renamed to that form's keys - or null when
 * the path isn't one of the sections' roots (an API route, the auth pages, a page already on a clean path). */
function legacyParams(pathname: string, params: URLSearchParams): URLSearchParams | null {
  const q = new URLSearchParams(params);
  const path = pathname.replace(/\/+$/, "") || "/";
  let section: Section | null = null;
  if (path === "/") section = isSection(q.get("section")) ? (q.get("section") as Section) : null;
  else if (path === "/season" || path === "/race") section = "season";
  else if (path === "/groups") section = "communities";
  else section = (Object.entries(SECTION_PATHS).find(([, p]) => p === path)?.[0] as Section | undefined) ?? null;
  if (!section) return null;

  if (path !== "/") {
    // Old key names: the archive's and the account's tab used to be `section`, the account's inner tab `tab`.
    if (section === "archive" && q.has("section")) renameKey(q, "section", "tab");
    if (section === "profile") {
      if (q.has("tab")) renameKey(q, "tab", "kind");
      if (q.has("section")) renameKey(q, "section", "tab");
    }
  }
  q.delete("section");
  q.set("section", section);
  return q;
}

function renameKey(q: URLSearchParams, from: string, to: string) {
  const value = q.get(from);
  q.delete(from);
  if (value !== null) q.set(to, value);
}

/** Where an old URL (`/?section=...`, or a path-style `/race?year=&race=`, `/groups?id=`, `/archive?driver=`) now
 * lives, or null when the request is already on today's URL (or isn't a section at all). Used only to redirect. */
export function cleanUrlFor(pathname: string, params: URLSearchParams): string | null {
  const q = legacyParams(pathname, params);
  if (!q) return null;
  const section = q.get("section") as Section;
  q.delete("section");
  const destination = sectionHref(section, Object.fromEntries(q));
  const current = `${pathname}${params.size ? `?${params.toString()}` : ""}`;
  return destination === current ? null : destination;
}
