"""Race photo candidates from Wikimedia Commons, for a person to approve (never published automatically).

    Wikimedia (race category + sub-categories, exact race-name search)
      -> licence and relevance filters -> ranking -> near-duplicate grouping -> top ~8 groups
      -> race_photo_candidates (pending) -> /admin/race-photos -> race_photos -> race page

Metadata only. A scan reads category listings and file metadata (licence, author, size, date) and builds the
500px/1280px thumbnail URLs from the original's path; it never downloads an image. The browser loads the
thumbnails straight from Wikimedia, so nothing is copied into Supabase Storage.

Polite to Wikimedia (https://meta.wikimedia.org/wiki/User-Agent_policy, API etiquette): a descriptive
User-Agent with contact details, one request at a time with a pause between them, results cached on disk,
and a 429/503 waits for its Retry-After instead of retrying quickly.

Run:
  python pipeline/race_photos.py                        # races from the last 5 weeks (the weekly job)
  python pipeline/race_photos.py --race 2026_r01_australian_grand_prix
  python pipeline/race_photos.py --race <id> --dry-run  # print what it would store, write nothing
  python pipeline/race_photos.py --recheck              # re-verify every approved photo against Commons
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import requests

API = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "ApexF1Hub-RacePhotos/1.0 (https://www.apexf1hub.com; https://github.com/adi-alt/F1-Hub/issues)"
REQUEST_GAP_SEC = 1.0          # sequential, one request at a time, at most about one a second
MAX_RETRY_AFTER_SEC = 300      # a longer wait than this means "come back next week", not "sleep"
MAX_ATTEMPTS = 4
CACHE_DIR = Path(__file__).resolve().parent / "f1_cache" / "wikimedia"
CACHE_TTL_SEC = 6 * 3600       # category listings and metadata change slowly; a rerun within hours reuses them

THUMB_WIDTH = 500              # gallery; Wikimedia serves only its standard widths (330/500/960/1280/1920)
IMAGE_WIDTH = 1280             # expanded view
MIN_WIDTH = IMAGE_WIDTH        # a 1280px rendition must exist without upscaling
MAX_GROUPS = 8                 # candidates offered for review
MAX_FRAMES_PER_GROUP = 6       # alternates the reviewer can swap in from the same burst
SEQUENCE_GAP = 25              # frame numbers this close, same photographer and camera = one burst
SCAN_WINDOW_DAYS = 35          # the weekly job revisits a race for five weeks: uploads keep arriving

# Licences we may show on a commercial website with attribution. Anything else - NC, ND, fair use,
# "all rights reserved", unknown - is rejected. The database enforces the same rule (CHECK constraint).
LICENCE_EXACT = {"cc0": "CC0", "cc0 1.0": "CC0", "public domain": "Public domain", "pd": "Public domain"}
LICENCE_CC = re.compile(r"^cc[ -]by(-sa)?[ -]([0-9]\.[0-9])$", re.I)

CAR = re.compile(
    r"^File:(Mercedes|McLaren|Ferrari|Scuderia Ferrari|Red Bull|RB|Racing Bulls|Haas|Alpine|Williams|Aston Martin|"
    r"Sauber|Kick Sauber|Audi|Cadillac)\b.*\bof [A-Z]",
    re.I,
)
ATMOSPHERE = re.compile(r"grandstand|track walk|fan zone|fanzone|season opener|turn \d+|crowd|pit lane walk", re.I)
NON_F1 = re.compile(r"porsche|carrera cup|supercars?\b|parade|f1 academy|formula 2|formula 3|\bf2\b|\bf3\b|support race", re.I)
NOT_A_PHOTO_SUBJECT = re.compile(r"aerospatiale|helicopter|aircraft|logo|poster|screenshot|\bmap\b|ticket|banner|layout|diagram", re.I)
FRAME = re.compile(r"\(([0-9A-Za-z]*[A-Za-z])?[ _]?(\d{3,6})\)\.\w+$")  # "(028A8486)", "(IMG 0550)", "(DSCF2689)"


# ------------------------------------------------------------------------------------------------ Wikimedia

class Wikimedia:
    """Sequential, cached, rate-limit-respecting MediaWiki API client. Never downloads image bytes.
    Commons by default; pass api=WIKIPEDIA_API for English Wikipedia (same etiquette, same cache directory)."""

    def __init__(self, cache: bool = True, sleep=time.sleep, session: requests.Session | None = None, api: str = API):
        self.api = api
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.cache = cache
        self.sleep = sleep
        self._last = 0.0
        self.requests_made = 0

    def _cache_path(self, params: dict) -> Path:
        # Commons keys stay as they were (existing caches remain valid); other wikis add their endpoint.
        keyed = params if self.api == API else {**params, "_api": self.api}
        key = hashlib.sha256(json.dumps(keyed, sort_keys=True).encode()).hexdigest()[:32]
        return CACHE_DIR / f"{key}.json"

    def get(self, **params) -> dict:
        params = {**params, "format": "json", "formatversion": "2"}
        path = self._cache_path(params)
        if self.cache and path.exists() and time.time() - path.stat().st_mtime < CACHE_TTL_SEC:
            return json.loads(path.read_text())
        for attempt in range(1, MAX_ATTEMPTS + 1):
            wait = REQUEST_GAP_SEC - (time.monotonic() - self._last)
            if wait > 0:
                self.sleep(wait)
            self._last = time.monotonic()
            self.requests_made += 1
            resp = self.session.get(self.api, params=params, timeout=30)
            if resp.status_code in (429, 503):
                retry_after = _retry_after_seconds(resp.headers.get("Retry-After"), default=30 * attempt)
                if retry_after > MAX_RETRY_AFTER_SEC or attempt == MAX_ATTEMPTS:
                    raise RateLimited(f"Wikimedia asked us to wait {retry_after}s; stopping this scan")
                print(f"  Wikimedia returned {resp.status_code}; waiting {retry_after}s as asked (Retry-After)")
                self.sleep(retry_after)
                continue
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"Wikimedia API error: {data['error'].get('info', data['error'])}")
            if self.cache:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data))
            return data
        raise RateLimited("Wikimedia kept rate limiting")

    def subcategories(self, root: str, depth: int = 2) -> list[str]:
        seen, queue = {root: 0}, [root]
        while queue:
            cat = queue.pop(0)
            if seen[cat] >= depth:
                continue
            data = self.get(action="query", list="categorymembers", cmtitle=cat, cmtype="subcat", cmlimit="500")
            for m in data.get("query", {}).get("categorymembers", []):
                if m["title"] not in seen:
                    seen[m["title"]] = seen[cat] + 1
                    queue.append(m["title"])
        return list(seen)

    def _files(self, **generator) -> list[dict]:
        out, cont = [], {}
        while True:
            data = self.get(prop="imageinfo|categories", cllimit="max", clshow="!hidden",
                            iiprop="url|size|mime|extmetadata", action="query", **generator, **cont)
            out += data.get("query", {}).get("pages", [])
            if "continue" not in data:
                return out
            cont = data["continue"]

    def category_files(self, category: str) -> list[dict]:
        return self._files(generator="categorymembers", gcmtitle=category, gcmtype="file", gcmlimit="50")

    def exact_search_files(self, phrase: str) -> list[dict]:
        return self._files(generator="search", gsrsearch=f'"{phrase}"', gsrnamespace="6", gsrlimit="50")

    def files_by_title(self, titles: list[str]) -> list[dict]:
        out = []
        for i in range(0, len(titles), 50):
            data = self.get(action="query", titles="|".join(titles[i:i + 50]), prop="imageinfo", iiprop="url|size|mime|extmetadata")
            out += data.get("query", {}).get("pages", [])
        return out


class RateLimited(Exception):
    pass


def _retry_after_seconds(value: str | None, default: int) -> int:
    if not value:
        return default
    try:
        return max(1, int(value))
    except ValueError:
        try:
            when = datetime.strptime(value, "%a, %d %b %Y %H:%M:%S GMT").replace(tzinfo=timezone.utc)
            return max(1, int((when - datetime.now(timezone.utc)).total_seconds()))
        except ValueError:
            return default


# ------------------------------------------------------------------------------------------ pure filtering

@dataclass
class Race:
    id: str
    year: int
    name: str              # "Australian Grand Prix"
    race_date: date

    @property
    def title(self) -> str:
        return f"{self.year} {self.name}"

    @property
    def weekend(self) -> tuple[date, date]:
        return self.race_date - timedelta(days=3), self.race_date


@dataclass
class Candidate:
    provider_id: str
    image_url: str
    thumbnail_url: str
    source_url: str
    photographer: str
    license: str
    license_url: str
    alt_text: str
    width: int
    height: int
    taken_on: str
    subject: str
    score: int
    reasons: list[str] = field(default_factory=list)
    group_key: str = ""
    seq: tuple | None = None


def strip_html(value: str | None) -> str:
    text = re.sub(r"<[^>]+>", "", value or "")
    text = text.replace("&amp;", "&").replace("&#039;", "'").replace("&quot;", '"').replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def normalise_licence(short_name: str) -> str | None:
    """'CC BY-SA 4.0' / 'CC0' / 'Public domain' when allowed, else None."""
    raw = strip_html(short_name).strip()
    if raw.lower() in LICENCE_EXACT:
        return LICENCE_EXACT[raw.lower()]
    m = LICENCE_CC.match(raw)
    return f"CC BY{(m.group(1) or '').upper()} {m.group(2)}" if m else None


def thumb_url(original: str, width: int) -> str:
    """upload.wikimedia.org/wikipedia/commons/a/ab/Name.jpg -> .../commons/thumb/a/ab/Name.jpg/<w>px-Name.jpg"""
    original = original.split("?")[0]
    head, name = original.rsplit("/", 1)
    return f"{head.replace('/commons/', '/commons/thumb/', 1)}/{name}/{width}px-{name}"


def mentions_race(page: dict, race: Race, description: str) -> bool:
    needle = race.title.lower()
    cats = " ".join(c.get("title", "") for c in page.get("categories", []))
    return needle in page["title"].lower() or needle in description.lower() or needle in cats.lower()


def evaluate(page: dict, race: Race, found_in: set[str]) -> tuple[Candidate | None, str | None]:
    """A candidate, or the reason it was rejected. Pure: everything it needs is in `page`."""
    title = page["title"]
    info = (page.get("imageinfo") or [None])[0]
    if not info:
        return None, "no file information"
    meta = info.get("extmetadata", {})
    value = lambda k: (meta.get(k) or {}).get("value", "")

    licence = normalise_licence(value("LicenseShortName"))
    if not licence:
        return None, f"licence not allowed ({strip_html(value('LicenseShortName')) or 'missing'})"
    licence_url = strip_html(value("LicenseUrl"))
    if licence_url.startswith("//"):
        licence_url = "https:" + licence_url
    if not re.match(r"^https?://", licence_url):
        return None, "no licence URL"
    photographer = strip_html(value("Artist"))
    if not photographer:
        return None, "no photographer for the credit"
    if value("Restrictions").strip():
        return None, f"restricted ({strip_html(value('Restrictions'))[:40]})"
    if info.get("mime") != "image/jpeg":
        return None, f"not a photo ({info.get('mime')})"
    if NON_F1.search(title):
        return None, "not Formula 1 (support series or parade)"
    if NOT_A_PHOTO_SUBJECT.search(title):
        return None, "not a race photo (aircraft, logo, poster, map...)"
    width, height = int(info.get("width") or 0), int(info.get("height") or 0)
    if width < MIN_WIDTH:
        return None, f"too small (under {MIN_WIDTH}px wide)"
    shot = re.search(r"(\d{4})-(\d{2})-(\d{2})", value("DateTimeOriginal") or value("DateTime"))
    taken = date(*map(int, shot.groups())) if shot else None
    start, end = race.weekend
    if not taken or not (start <= taken <= end):
        return None, "not taken during the race weekend"
    description = strip_html(value("ImageDescription"))
    if not any(c.startswith("Category:") for c in found_in) and not mentions_race(page, race, description):
        return None, "search hit that doesn't name this race"

    in_sub = " ".join(found_in)
    if CAR.search(title):
        subject = "car"
    elif "Podium" in in_sub or "podium" in title.lower():
        subject = "podium"
    elif "drivers at" in in_sub or "People at" in in_sub or re.search(r" at the Melbourne Walk during| walk during", title):
        subject = "driver"
    elif ATMOSPHERE.search(title):
        subject = "atmosphere"
    else:
        subject = "general"

    score, reasons = {"car": 6, "podium": 5, "driver": 2, "atmosphere": 1, "general": 2}[subject], [f"subject: {subject}"]
    if race.title.lower() in title.lower():
        score += 3; reasons.append("names the race")
    if width > height:
        score += 3; reasons.append("landscape")
    else:
        reasons.append("portrait")
    if taken == race.race_date:
        score += 2; reasons.append("race day")
    if width >= 3000:
        score += 1; reasons.append("high resolution")

    frame = FRAME.search(title)
    alt = description or re.sub(r"\s*\([^)]*\)\.\w+$|\.\w+$", "", title.removeprefix("File:"))
    return Candidate(
        provider_id=title,
        image_url=thumb_url(info["url"], IMAGE_WIDTH),
        thumbnail_url=thumb_url(info["url"], THUMB_WIDTH),
        source_url=info["descriptionurl"].split("?")[0],
        photographer=photographer[:200],
        license=licence,
        license_url=licence_url,
        alt_text=alt[:300],
        width=width,
        height=height,
        taken_on=taken.isoformat(),
        subject=subject,
        score=score,
        reasons=reasons,
        # Same photographer, camera prefix and subject ("Haas VF-26 of Oliver Bearman"), then frame number:
        # cars shot seconds apart are different photos, frames of one podium celebration are not.
        seq=(photographer, (frame.group(1) or "").upper(), FRAME.sub("", title).strip().lower(), int(frame.group(2))) if frame else None,
    ), None


def group_bursts(cands: list[Candidate]) -> None:
    """Same photographer, camera prefix and subject, frame numbers within SEQUENCE_GAP of the previous one: one burst."""
    seqd = sorted((c for c in cands if c.seq), key=lambda c: c.seq)
    group, prev = 0, None
    for c in seqd:
        if not (prev and prev[:3] == c.seq[:3] and c.seq[3] - prev[3] <= SEQUENCE_GAP):
            group += 1
        c.group_key = f"burst-{group}"
        prev = c.seq
    for c in cands:
        if not c.seq:
            c.group_key = "file-" + hashlib.sha1(c.provider_id.encode()).hexdigest()[:10]


def select(cands: list[Candidate]) -> list[Candidate]:
    """The best frame of up to MAX_GROUPS bursts, taken round-robin across subjects so no one kind of photo
    fills the review list, plus up to MAX_FRAMES_PER_GROUP - 1 alternates per chosen burst."""
    group_bursts(cands)
    groups: dict[str, list[Candidate]] = {}
    for c in sorted(cands, key=lambda c: (-c.score, c.provider_id)):
        groups.setdefault(c.group_key, []).append(c)
    by_subject: dict[str, list[list[Candidate]]] = {}
    for frames in sorted(groups.values(), key=lambda fs: (-fs[0].score, fs[0].provider_id)):
        by_subject.setdefault(frames[0].subject, []).append(frames)
    order = ["car", "podium", "driver", "atmosphere", "general"]
    chosen: list[list[Candidate]] = []
    while len(chosen) < MAX_GROUPS and any(by_subject.get(s) for s in order):
        for s in order:
            if by_subject.get(s) and len(chosen) < MAX_GROUPS:
                chosen.append(by_subject[s].pop(0))
    return [c for frames in chosen for c in frames[:MAX_FRAMES_PER_GROUP]]


# ---------------------------------------------------------------------------------------------- the scan

def scan(wm: Wikimedia, race: Race) -> tuple[list[Candidate], dict[str, int], int]:
    """(selected candidates, rejection reasons -> count, files seen) for one race."""
    found_in: dict[str, set[str]] = {}
    pages: dict[str, dict] = {}
    for cat in wm.subcategories(f"Category:{race.title}"):
        for p in wm.category_files(cat):
            pages[p["title"]] = p
            found_in.setdefault(p["title"], set()).add(cat)
    for p in wm.exact_search_files(race.title):
        pages.setdefault(p["title"], p)
        found_in.setdefault(p["title"], set()).add("search")
    rejected: dict[str, int] = {}
    cands = []
    for title, page in pages.items():
        cand, reason = evaluate(page, race, found_in[title])
        if cand:
            cands.append(cand)
        else:
            rejected[reason] = rejected.get(reason, 0) + 1
    return select(cands), rejected, len(pages)


def store(cur, race: Race, cands: list[Candidate]) -> int:
    """Upsert as pending. A candidate already approved or rejected keeps its status: a rescan never re-asks."""
    for c in cands:
        cur.execute(
            """
            insert into race_photo_candidates (race_id, provider, provider_id, image_url, thumbnail_url, source_url,
              photographer, license, license_url, alt_text, width, height, taken_on, subject, score, group_key)
            values (%s, 'wikimedia', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (race_id, provider, provider_id) do update set
              image_url = excluded.image_url, thumbnail_url = excluded.thumbnail_url, source_url = excluded.source_url,
              photographer = excluded.photographer, license = excluded.license, license_url = excluded.license_url,
              alt_text = excluded.alt_text, width = excluded.width, height = excluded.height,
              subject = excluded.subject, score = excluded.score, group_key = excluded.group_key
            """,
            (race.id, c.provider_id, c.image_url, c.thumbnail_url, c.source_url, c.photographer, c.license,
             c.license_url, c.alt_text, c.width, c.height, c.taken_on, c.subject, c.score, c.group_key),
        )
    return len(cands)


def recheck(cur, wm: Wikimedia) -> dict[str, int]:
    """Weekly: every approved photo must still exist on Commons with an allowed licence and full attribution.
    Anything that fails is removed from race_photos (and its candidate marked rejected), so the page stops
    showing it. Attribution text that changed but still passes is updated in place."""
    cur.execute("select id, race_id, provider_id, candidate_id from race_photos where provider = 'wikimedia'")
    rows = cur.fetchall()
    pages = {p["title"]: p for p in wm.files_by_title([r[2] for r in rows])} if rows else {}
    counts = {"kept": 0, "updated": 0, "removed": 0}
    for photo_id, race_id, title, candidate_id in rows:
        page = pages.get(title)
        info = (page or {}).get("imageinfo") or [None]
        reason = None
        if not page or page.get("missing") or not info[0]:
            reason = "deleted from Commons"
        else:
            meta = info[0].get("extmetadata", {})
            value = lambda k: (meta.get(k) or {}).get("value", "")
            licence = normalise_licence(value("LicenseShortName"))
            licence_url = strip_html(value("LicenseUrl"))
            licence_url = "https:" + licence_url if licence_url.startswith("//") else licence_url
            photographer = strip_html(value("Artist"))
            if not licence:
                reason = f"licence no longer allowed ({strip_html(value('LicenseShortName')) or 'missing'})"
            elif not re.match(r"^https?://", licence_url) or not photographer:
                reason = "attribution details missing"
            elif value("Restrictions").strip():
                reason = "now restricted"
        if reason:
            print(f"  removing {title} from {race_id}: {reason}")
            cur.execute("delete from race_photos where id = %s", (photo_id,))
            if candidate_id:
                cur.execute("update race_photo_candidates set status = 'rejected', reviewed_at = now() where id = %s", (candidate_id,))
            counts["removed"] += 1
            continue
        cur.execute(
            "update race_photos set photographer = %s, license = %s, license_url = %s, checked_at = now() "
            "where id = %s and (photographer, license, license_url) is distinct from (%s, %s, %s)",
            (photographer[:200], licence, licence_url, photo_id, photographer[:200], licence, licence_url),
        )
        if cur.rowcount:
            counts["updated"] += 1
        else:
            cur.execute("update race_photos set checked_at = now() where id = %s", (photo_id,))
            counts["kept"] += 1
    return counts


def races_to_scan(cur, race_id: str | None, today: date) -> list[Race]:
    if race_id:
        # The id, or the race's title ("2026 Australian Grand Prix"), which is easier to type into a dispatch.
        cur.execute("select id, year, name, race_date from races where id = %s or year::text || ' ' || name = %s", (race_id, race_id))
    else:
        cur.execute(
            "select id, year, name, race_date from races where race_date between %s and %s order by race_date",
            (today - timedelta(days=SCAN_WINDOW_DAYS), today),
        )
    return [Race(id=r[0], year=r[1], name=r[2], race_date=r[3]) for r in cur.fetchall() if r[3]]


def report(race: Race, cands: list[Candidate], rejected: dict[str, int], seen: int) -> None:
    groups = []
    for c in cands:
        if c.group_key not in groups:
            groups.append(c.group_key)
    print(f"\n{race.title} ({race.id}): {seen} files, {len(cands)} candidates in {len(groups)} groups")
    for reason, n in sorted(rejected.items(), key=lambda kv: -kv[1]):
        print(f"  rejected {n:4d}  {reason}")
    for g in groups:
        frames = [c for c in cands if c.group_key == g]
        best = frames[0]
        print(f"  [{best.subject}] {best.provider_id} score {best.score} ({'; '.join(best.reasons)})"
              f"{f' +{len(frames) - 1} alternates' if len(frames) > 1 else ''}")
        print(f"      {best.photographer} · {best.license} · {best.thumbnail_url}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--race", help="one race id")
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    ap.add_argument("--recheck", action="store_true", help="re-verify approved photos instead of scanning")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--race-name", help="with --dry-run and --race-date: scan without a database, e.g. 'Australian Grand Prix'")
    ap.add_argument("--race-date", help="YYYY-MM-DD, the race (Sunday) date")
    args = ap.parse_args()

    wm = Wikimedia(cache=not args.no_cache)
    if args.dry_run and args.race_name and args.race_date:
        race_day = date.fromisoformat(args.race_date)
        race = Race(id=args.race or "(dry run)", year=race_day.year, name=args.race_name, race_date=race_day)
        cands, rejected, seen = scan(wm, race)
        report(race, cands, rejected, seen)
        if os.environ.get("RACE_PHOTOS_JSON"):
            Path(os.environ["RACE_PHOTOS_JSON"]).write_text(json.dumps([asdict(c) for c in cands], indent=1))
        print(f"\n{wm.requests_made} Wikimedia API requests (cache hits not counted); no images downloaded")
        return 0

    from ergast_utils import init_postgres, trigger_revalidation

    conn = init_postgres()
    changed = False
    with conn.cursor() as cur:
        if args.recheck:
            counts = recheck(cur, wm)
            print(f"recheck: {counts}")
            changed = counts["removed"] + counts["updated"] > 0
        else:
            races = races_to_scan(cur, args.race, datetime.now(timezone.utc).date())
            if args.race and not races:
                print(f"no race with id {args.race}", file=sys.stderr)
                return 1
            for race in races:
                try:
                    cands, rejected, seen = scan(wm, race)
                except RateLimited as exc:
                    print(f"{race.title}: {exc}; it will be picked up on the next run")
                    continue
                report(race, cands, rejected, seen)
                if not args.dry_run:
                    store(cur, race, cands)
    conn.close()
    print(f"\n{wm.requests_made} Wikimedia API requests (cache hits not counted); no images downloaded")
    if changed and not args.dry_run:
        trigger_revalidation("race-photos")
    return 0


if __name__ == "__main__":
    from run_ledger import ledgered

    sys.exit(ledgered("race-photos")(main)())
