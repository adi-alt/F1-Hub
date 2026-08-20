// Shared between src/app/profile/page.tsx (merging current-season teams into the archive-sourced
// favorites list) and the homepage's favorite-team card (resolving a favorited archive team_id
// back to whichever current-season team, if any, it corresponds to) — extracted here rather than
// duplicated, since the two directions of this exact same lookup need to agree.

export function teamSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// A handful of current-season teams are the exact same real-world entity, same era, as an
// existing archive row — just under a different display string: Ergast's archive calls them
// "Red Bull" / "RB F1 Team" / "Alpine F1 Team", the current season's own live data calls the same
// teams "Red Bull Racing" / "Racing Bulls" / "Alpine". teamSlug() alone can't catch that, so
// without this each would show up as a second, near-empty row instead of extending the real one.
// Deliberately a short explicit list rather than fuzzy name matching: a genuine rebrand into a
// *new* era (Toro Rosso -> AlphaTauri -> RB F1 Team, Renault -> Alpine F1 Team, Sauber -> Audi)
// is a real editorial call about whether to treat it as "the same team" across time, not a same-
// era spelling variant — those stay their own rows in the archive itself (see
// enrich_archive_entities.py's EARLY_ERA_OVERRIDES for the reverse problem: names *reused* across
// unrelated eras, like "Mercedes" 1954-55 vs. today).
export const CURRENT_SEASON_TEAM_ALIASES: Record<string, string> = {
  "red bull racing": "red_bull",
  "racing bulls": "rb_f1_team",
  alpine: "alpine_f1_team",
};

/** archive team_id -> the slug a current-season team's own display name would produce. */
export function archiveSlugForCurrentTeam(currentTeamName: string): string {
  return CURRENT_SEASON_TEAM_ALIASES[currentTeamName.trim().toLowerCase()] ?? teamSlug(currentTeamName);
}
