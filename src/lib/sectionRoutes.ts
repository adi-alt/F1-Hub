/**
 * The site's one URL shape: every page lives at the root, picked by `section` (the header's names), with the page's
 * own query after it - `/?section=archive&team=ferrari`, `/?section=season&year=2026&race=british-grand-prix`.
 *
 * The pages themselves still live in their own folders (app/archive, app/season, ...): src/proxy.ts rewrites the
 * public URL to the folder's path (the browser keeps the public one), and answers the old path-style URLs with a
 * permanent redirect to the public shape. Pure, so the proxy, the header and the link helpers share one definition.
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

/** Where a public URL's page lives: `?section=season` with a race slug is a race's page, which belongs to Season. */
export function internalPathFor(params: URLSearchParams): string | null {
  const section = params.get("section");
  if (!isSection(section)) return null;
  // An old numeric link (`race=18`) is the season page's race window, not a race page; it still opens there.
  if (section === "season" && params.has("race") && !/^\d+$/.test(params.get("race") ?? "")) return "/race";
  return SECTION_PATHS[section];
}

type Params = Record<string, string | number | null | undefined>;

/** A public URL: `/?section=<section>` then the given params, in order, skipping empty ones. */
export function sectionHref(section: Section, params: Params = {}): string {
  const q = new URLSearchParams({ section });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return `/?${q.toString()}`;
}

/** The section an old (path-style) URL belongs to, with its query renamed to today's keys - or null when the path
 * isn't one of the sections (an API route, the auth pages). Used only to redirect old links. */
export function publicUrlForPath(pathname: string, params: URLSearchParams): string | null {
  const q = new URLSearchParams(params);
  const path = pathname.replace(/\/+$/, "") || "/";
  let section: Section | null = null;
  if (path === "/season" || path === "/race") section = "season";
  else if (path === "/groups") section = "communities";
  else if (path === "/admin/race-photos") section = "photos";
  else section = (Object.entries(SECTION_PATHS).find(([, p]) => p === path)?.[0] as Section | undefined) ?? null;
  if (!section) return null;

  // Old key names: the archive's and the account's tab used to be `section`, the account's inner tab `tab`.
  if (section === "archive" && q.has("section")) renameKey(q, "section", "tab");
  if (section === "profile") {
    if (q.has("tab")) renameKey(q, "tab", "kind");
    if (q.has("section")) renameKey(q, "section", "tab");
  }
  q.delete("section");
  const out = new URLSearchParams({ section });
  for (const [k, v] of q) out.append(k, v);
  return `/?${out.toString()}`;
}

function renameKey(q: URLSearchParams, from: string, to: string) {
  const value = q.get(from);
  q.delete(from);
  if (value !== null) q.set(to, value);
}

/** The nav section a page is in, from the browser's URL (pathname plus query), for the header's active item. */
export function sectionOfUrl(pathname: string | null | undefined, params: URLSearchParams | null | undefined): Section | null {
  if (pathname === "/" || !pathname) {
    const s = params?.get("section");
    return isSection(s) ? s : null;
  }
  const url = publicUrlForPath(pathname, params ?? new URLSearchParams());
  return url ? (new URLSearchParams(url.slice(2)).get("section") as Section) : null;
}

/** The page's own path behind the browser's URL: what a component that used to branch on the pathname should read. */
export function appPathOf(pathname: string | null | undefined, params: URLSearchParams | null | undefined): string {
  if (pathname === "/" && params) return internalPathFor(params) ?? "/";
  return pathname ?? "/";
}
