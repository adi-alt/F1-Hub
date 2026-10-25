/** The top-level sections the header and the mobile nav link to. */
export type NavSection = "season" | "circuits" | "archive" | "communities" | "users" | "models" | "photos";

// Race pages belong to Season: they are reached from it and are the current season's rounds.
const SECTION_ROOTS: [NavSection, string[]][] = [
  ["season", ["/season", "/race", "/races"]],
  ["circuits", ["/circuits"]],
  ["archive", ["/archive"]],
  ["communities", ["/communities", "/groups"]],
  ["users", ["/users"]],
  ["models", ["/models"]],
  ["photos", ["/admin/race-photos"]],
];

/**
 * The section a page is in, for the active nav item (aria-current="page"), or null for pages outside every section
 * (the home page, the account).
 */
export function navSectionFor(pathname: string | null | undefined): NavSection | null {
  if (!pathname) return null;
  const path = pathname;
  for (const [section, roots] of SECTION_ROOTS) {
    if (roots.some((root) => path === root || path.startsWith(`${root}/`))) return section;
  }
  return null;
}
