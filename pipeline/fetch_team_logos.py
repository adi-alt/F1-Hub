"""Backfills `teams.logo_url` for the current grid — a manual, small (11 entries) mapping rather
than anything auto-discovered, since there's no API anywhere (FastF1, Ergast/Jolpi, OpenF1) that
carries team logos at all. Wikipedia does, via the same page-summary lead-image technique
enrich_archive_circuits.py already uses for circuits, but the exact page title has to be curated
by hand per team — team display names collide with non-F1 Wikipedia pages too often to guess
reliably ("Williams" alone resolves to a disambiguation page, not the F1 team).

Every title below was verified live against the real API before being hardcoded here — this
isn't a guess. `teams` rows themselves are seeded by fetch_races.py (name + color, refreshed every
run); this script only ever adds/refreshes `logo_url` for teams that already have a row, and only
needs re-running when a new team joins the grid (a season boundary, roughly once a year) or a
team's own Wikipedia lead image changes (a livery/rebrand) - not on any schedule.

Run:
  export DATABASE_URL='<the pooled connection string, see .env.local>'
  export NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY  (see .env.local)
  python pipeline/fetch_team_logos.py
"""

import requests

from ergast_utils import fetch_and_upload_media, init_postgres, upsert

# team display name (exactly as FastF1's TeamName appears in race_results.team) -> Wikipedia page
# title. Verified live, 2026-08-20: every one of these resolves to that team's own current-season
# logo, not a disambiguation page or an unrelated "Williams the person" style collision.
TEAM_WIKIPEDIA_TITLES = {
    "McLaren": "McLaren",
    "Red Bull Racing": "Red_Bull_Racing",
    "Mercedes": "Mercedes-AMG_Petronas_F1_Team",
    "Ferrari": "Scuderia_Ferrari",
    "Racing Bulls": "Racing_Bulls",
    "Audi": "Audi_F1",
    "Alpine": "Alpine_F1_Team",
    "Aston Martin": "Aston_Martin_F1_Team",
    "Haas F1 Team": "Haas_F1_Team",
    "Williams": "Williams_Racing",
    "Cadillac": "Cadillac_F1",
}

WIKIPEDIA_HEADERS = {
    "User-Agent": "F1Hub-TeamLogos/1.0 (https://apexf1hub.vercel.app; one-off team-logo backfill)"
}


def fetch_team_logo_source(title: str):
    resp = requests.get(
        f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}",
        headers=WIKIPEDIA_HEADERS,
        timeout=15,
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    image = data.get("originalimage") or data.get("thumbnail")
    return image.get("source") if image else None


def slugify(name: str) -> str:
    return name.lower().replace(" ", "-")


def main():
    conn = init_postgres()
    with conn.cursor() as cur:
        cur.execute("select name from teams")
        known_teams = {r[0] for r in cur.fetchall()}

        rows = []
        for team, title in TEAM_WIKIPEDIA_TITLES.items():
            if team not in known_teams:
                print(f"  {team}: not in teams table yet (fetch_races.py hasn't seen them race) — skipping")
                continue
            source = fetch_team_logo_source(title)
            if not source:
                print(f"  {team}: no Wikipedia image found for {title}")
                continue
            uploaded = fetch_and_upload_media(source, "media", f"teams/{slugify(team)}.png")
            if uploaded:
                rows.append({"name": team, "logo_url": uploaded})
                print(f"  {team}: logo uploaded")

        upsert(cur, "teams", rows, ["name"])
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
