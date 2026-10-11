"""Circuit track maps: each circuit's Wikipedia lead image, which for a circuit article is its track map.

    archive_circuits.wikipedia_url -> en.wikipedia.org pageprops.page_image_free (the free lead image), used only
      when it is a map (SVG/PNG, not a logo); otherwise the article's own images, first one named like a map
      -> Commons imageinfo (licence allow-list, author, licence URL, source page)
      -> archive_circuits.track_map_* -> the app loads Wikimedia's 960px rendition directly

Replaces the circuit photos in image_url / image_urls (the first files of each circuit's Commons category,
often not the track at all) for display. Metadata only: no image is downloaded or copied into Storage.

A map that fails the checks, or that the article no longer has, clears all six track_map_* columns, so the
app shows no map rather than an uncredited or no-longer-allowed one. The database enforces the same rules
(supabase/migrations/20261010_circuit_track_maps.sql).

Uses race_photos.Wikimedia for both wikis: descriptive User-Agent, one request at a time about a second apart,
disk cache, Retry-After honoured.

Run:
  python pipeline/circuit_track_maps.py                      # every circuit with a wikipedia_url
  python pipeline/circuit_track_maps.py --circuit marina_bay
  python pipeline/circuit_track_maps.py --dry-run            # print what it would store, write nothing
  python pipeline/circuit_track_maps.py --titles "Marina_Bay_Street_Circuit,Monza_Circuit"   # no database
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

from race_photos import WIKIPEDIA_API, RateLimited, Wikimedia, normalise_licence, strip_html, thumb_url

# A map is a drawing: SVG or PNG. A JPEG is a photograph (Indianapolis', Sochi's and Zeltweg's lead images
# are), and some articles lead with the circuit's logo (Jeddah, Brands Hatch).
MAP_EXT = re.compile(r"\.(svg|png)$", re.I)
NOT_A_MAP = re.compile(r"formula[ _-]?e\b|\bFE\b|indycar|indy[ _]car|motogp|nascar|superbike|wec\b|logo|emblem|aerial|satellite|viewed|from above|panorama|photo|flag|coat[ _]of[ _]arms|crest|icon|portrait|signature|commons-|wikidata|wiki_|symbol", re.I)
MAP_NAME = re.compile(r"circuit|track|layout|map|course|kurs|strecke|raceway|speedway|ring\b|autodrom|street", re.I)
MAX_FALLBACK_FILES = 5   # article images tried per circuit when its lead image isn't a map

# Public-domain and CC0 files carry no LicenseUrl on Commons; these are the canonical pages for them.
PD_URLS = {"Public domain": "https://creativecommons.org/publicdomain/mark/1.0/", "CC0": "https://creativecommons.org/publicdomain/zero/1.0/"}

MAP_WIDTH = 960      # a standard Wikimedia thumbnail width (330/500/960/1280/1920); others return HTTP 400
BATCH = 50           # titles per API request, the MediaWiki limit for ordinary clients


@dataclass
class TrackMap:
    url: str
    source_url: str
    credit: str
    license: str
    license_url: str
    file: str


def title_from_url(wikipedia_url: str | None) -> str | None:
    """'http://en.wikipedia.org/wiki/Circuit_de_Monaco' -> 'Circuit de Monaco'. English Wikipedia only."""
    if not wikipedia_url:
        return None
    parsed = urlparse(wikipedia_url.strip())
    host = (parsed.hostname or "").lower()
    if host not in ("en.wikipedia.org", "en.m.wikipedia.org") or not parsed.path.startswith("/wiki/"):
        return None
    title = unquote(parsed.path[len("/wiki/"):]).replace("_", " ").strip()
    return title or None


def map_url(original: str, width: int, mime: str | None) -> str:
    """The MAP_WIDTH rendition: an SVG renders as PNG (".../960px-Name.svg.png"); a raster narrower than
    MAP_WIDTH can't be upscaled by Wikimedia, so its original is used."""
    original = original.split("?")[0]
    if mime == "image/svg+xml" or original.lower().endswith(".svg"):
        return thumb_url(original, MAP_WIDTH) + ".png"
    if width and width <= MAP_WIDTH:
        return original
    return thumb_url(original, MAP_WIDTH)


def evaluate(page: dict | None) -> tuple[TrackMap | None, str | None]:
    """A map, or why the file can't be used. Pure: everything it needs is in the Commons `page`."""
    if not page or page.get("missing"):
        return None, "file not on Commons"
    info = (page.get("imageinfo") or [None])[0]
    if not info or not info.get("url"):
        return None, "no file information"
    meta = info.get("extmetadata", {})
    value = lambda k: (meta.get(k) or {}).get("value", "")
    licence = normalise_licence(value("LicenseShortName"))
    if not licence:
        return None, f"licence not allowed ({strip_html(value('LicenseShortName')) or 'missing'})"
    licence_url = strip_html(value("LicenseUrl"))
    if licence_url.startswith("//"):
        licence_url = "https:" + licence_url
    if not licence_url and licence in PD_URLS:
        licence_url = PD_URLS[licence]
    if not re.match(r"^https?://", licence_url):
        return None, "no licence URL"
    author = strip_html(value("Artist"))
    if not author:
        return None, "no author for the credit"
    if value("Restrictions").strip():
        return None, f"restricted ({strip_html(value('Restrictions'))[:40]})"
    source = (info.get("descriptionurl") or "").split("?")[0]
    if not source.startswith("https://commons.wikimedia.org/wiki/File:"):
        return None, "no Commons source page"
    url = map_url(info["url"], int(info.get("width") or 0), info.get("mime"))
    if not url.startswith("https://upload.wikimedia.org/"):
        return None, "not hosted on upload.wikimedia.org"
    return TrackMap(url=url, source_url=source, credit=author[:200], license=licence, license_url=licence_url,
                    file=page["title"]), None


def lead_images(wp: Wikimedia, titles: list[str]) -> dict[str, str | None]:
    """Article title (as given) -> its free lead image file name ('Monza_track_map.svg'), or None."""
    out: dict[str, str | None] = {}
    unique = list(dict.fromkeys(titles))
    for i in range(0, len(unique), BATCH):
        chunk = unique[i:i + BATCH]
        data = wp.get(action="query", titles="|".join(chunk), prop="pageprops", ppprop="page_image_free", redirects="1")
        q = data.get("query", {})
        # Follow the API's own normalisation and redirects back to the title we asked for.
        renamed = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redirects = {r["from"]: r["to"] for r in q.get("redirects", [])}
        by_title = {p["title"]: (p.get("pageprops") or {}).get("page_image_free") for p in q.get("pages", [])}
        for t in chunk:
            final = renamed.get(t, t)
            final = redirects.get(final, final)
            out[t] = by_title.get(final)
    return out


def file_pages(commons: Wikimedia, files: list[str]) -> dict[str, dict]:
    """'File:Name.svg' -> Commons page with imageinfo (url, size, mime, extmetadata)."""
    out: dict[str, dict] = {}
    unique = list(dict.fromkeys(files))
    for i in range(0, len(unique), BATCH):
        chunk = unique[i:i + BATCH]
        data = commons.get(action="query", titles="|".join(chunk), prop="imageinfo",
                           iiprop="url|size|mime|extmetadata", iiurlwidth=str(MAP_WIDTH))
        q = data.get("query", {})
        renamed = {n["from"]: n["to"] for n in q.get("normalized", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for f in chunk:
            out[f] = pages.get(renamed.get(f, f), {"title": f, "missing": True})
    return out


def is_map_file(name: str, named_like_map: bool = False) -> bool:
    """A drawing (SVG/PNG) that isn't a logo; for an article's other images, also named like a track map."""
    base = name.removeprefix("File:")
    return bool(MAP_EXT.search(base)) and not NOT_A_MAP.search(base) and (not named_like_map or bool(MAP_NAME.search(base)))


def article_images(wp: Wikimedia, title: str) -> list[str]:
    """The article's own image files, in page order ('File:Name.svg')."""
    data = wp.get(action="query", titles=title, prop="images", imlimit="max", redirects="1")
    return [i["title"] for p in data.get("query", {}).get("pages", []) for i in p.get("images", [])]


def candidates(wp: Wikimedia, titles: list[str]) -> dict[str, list[str]]:
    """Article title -> files to try, best first: the lead image when it is a map, else the article's images
    named like a track map."""
    out: dict[str, list[str]] = {}
    for t, name in lead_images(wp, titles).items():
        lead = f"File:{name.replace('_', ' ')}" if name else None
        if lead and is_map_file(lead):
            out[t] = [lead]
            continue
        out[t] = [f for f in article_images(wp, t) if is_map_file(f, named_like_map=True)][:MAX_FALLBACK_FILES]
    return out


def find_maps(wp: Wikimedia, commons: Wikimedia, titles: list[str]) -> dict[str, tuple[TrackMap | None, str | None]]:
    """Article title -> (map, None) or (None, reason): the first candidate file that passes every check."""
    files = candidates(wp, titles)
    every = [f for fs in files.values() for f in fs]
    pages = file_pages(commons, every) if every else {}
    out: dict[str, tuple[TrackMap | None, str | None]] = {}
    for t in titles:
        if not files.get(t):
            out[t] = (None, "no track map on the article")
            continue
        reasons = []
        for f in files[t]:
            m, why = evaluate(pages.get(f))
            if m:
                out[t] = (m, None)
                break
            reasons.append(why)
        else:
            out[t] = (None, reasons[0])
    return out


def store(cur, circuit_id: str, m: TrackMap | None) -> bool:
    """Write the map (or clear all six columns). True when the row changed."""
    if m:
        cur.execute(
            "update archive_circuits set track_map_url = %s, track_map_source_url = %s, track_map_credit = %s, "
            "track_map_license = %s, track_map_license_url = %s, track_map_checked_at = now() "
            "where circuit_id = %s and (track_map_url, track_map_source_url, track_map_credit, track_map_license, "
            "track_map_license_url) is distinct from (%s, %s, %s, %s, %s)",
            (m.url, m.source_url, m.credit, m.license, m.license_url, circuit_id,
             m.url, m.source_url, m.credit, m.license, m.license_url),
        )
        if cur.rowcount:
            return True
        cur.execute("update archive_circuits set track_map_checked_at = now() where circuit_id = %s", (circuit_id,))
        return False
    cur.execute(
        "update archive_circuits set track_map_url = null, track_map_source_url = null, track_map_credit = null, "
        "track_map_license = null, track_map_license_url = null, track_map_checked_at = null "
        "where circuit_id = %s and track_map_url is not null",
        (circuit_id,),
    )
    return bool(cur.rowcount)


def report(label: str, title: str | None, result: tuple[TrackMap | None, str | None]) -> None:
    m, reason = result
    if m:
        print(f"{label}: {m.file}\n    {m.credit} · {m.license} ({m.license_url})\n    {m.url}\n    {m.source_url}")
    else:
        print(f"{label}: no map ({reason}){f' [{title}]' if title else ''}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--circuit", help="one archive_circuits.circuit_id")
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    ap.add_argument("--titles", help="comma-separated Wikipedia titles: look them up without a database, write nothing")
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    wp = Wikimedia(cache=not args.no_cache, api=WIKIPEDIA_API)
    commons = Wikimedia(cache=not args.no_cache)

    if args.titles:
        titles = [t.strip().replace("_", " ") for t in args.titles.split(",") if t.strip()]
        results = find_maps(wp, commons, titles)
        for t in titles:
            report(t, None, results[t])
        print(f"\n{wp.requests_made + commons.requests_made} Wikimedia API requests (cache hits not counted); no images downloaded")
        return 0

    from ergast_utils import init_postgres, trigger_revalidation

    conn = init_postgres()
    counts = {"stored": 0, "unchanged": 0, "cleared": 0, "none": 0}
    with conn.cursor() as cur:
        if args.circuit:
            cur.execute("select circuit_id, wikipedia_url from archive_circuits where circuit_id = %s", (args.circuit,))
        else:
            cur.execute("select circuit_id, wikipedia_url from archive_circuits where wikipedia_url is not null order by circuit_id")
        rows = cur.fetchall()
        if args.circuit and not rows:
            print(f"no circuit with id {args.circuit}", file=sys.stderr)
            return 1
        by_circuit = {cid: title_from_url(url) for cid, url in rows}
        try:
            results = find_maps(wp, commons, [t for t in by_circuit.values() if t])
        except RateLimited as exc:
            print(f"{exc}; nothing written, try again later")
            return 1
        for cid, title in by_circuit.items():
            result = results.get(title) if title else (None, "no English Wikipedia article")
            report(cid, title, result)
            if args.dry_run:
                continue
            changed = store(cur, cid, result[0])
            if result[0]:
                counts["stored" if changed else "unchanged"] += 1
            else:
                counts["cleared" if changed else "none"] += 1
    conn.close()
    print(f"\n{wp.requests_made + commons.requests_made} Wikimedia API requests (cache hits not counted); no images downloaded")
    if not args.dry_run:
        print(f"track maps: {counts}")
        if counts["stored"] or counts["cleared"]:
            trigger_revalidation("archive-data")
    return 0


if __name__ == "__main__":
    from run_ledger import ledgered

    sys.exit(ledgered("circuit-track-maps")(main)())
