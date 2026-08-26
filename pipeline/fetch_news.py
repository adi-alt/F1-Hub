"""Polls Formula1.com's own RSS feed and appends any new articles to `news`. That feed only ever
exposes its latest ~10 items, with no publish date, so this builds an ever-growing archive forward
from whenever this script first started running, not a backfilled history. `guid` (the feed's own
permalink) is the natural dedup key across runs, since a given poll's 10 items mostly overlap with
the previous one.

Run:
  python pipeline/fetch_news.py
"""

import xml.etree.ElementTree as ET

import requests

from ergast_utils import init_postgres, upsert

FEED_URL = "https://www.formula1.com/en/latest/all.xml"
NS = {"dc": "https://purl.org/dc/elements/1.1/"}


def fetch_items():
    # A real User-Agent — the feed 404s/blocks the default python-requests one in practice.
    resp = requests.get(FEED_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    items = []
    for item in root.iter("item"):
        guid = item.findtext("guid")
        link = item.findtext("link")
        title = item.findtext("title")
        if not guid or not link or not title:
            continue  # skip anything the feed didn't actually give a usable identity/title to
        items.append(
            {
                "guid": guid.strip(),
                "title": title.strip(),
                "description": (item.findtext("description") or "").strip() or None,
                "link": link.strip(),
                "creator": (item.findtext("dc:creator", namespaces=NS) or "").strip() or None,
            }
        )
    return items


def main():
    items = fetch_items()
    print(f"Fetched {len(items)} items from the feed")
    conn = init_postgres()
    with conn.cursor() as cur:
        # fetched_at deliberately isn't in these rows — its table default only applies on a
        # genuinely new guid, so re-polling the same 10 items every run doesn't creep an existing
        # article's "first seen" timestamp forward.
        upsert(cur, "news", items, ["guid"])
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
