"""Plain assert-based self-check (no pytest, no network) for the race photo pipeline: the licence allow-list,
the relevance filters, near-duplicate grouping, subject diversity, Retry-After handling and the weekly
re-check. `python test_race_photos.py`."""

from datetime import date

import race_photos as rp

RACE = rp.Race(id="2026_r01_australian_grand_prix", year=2026, name="Australian Grand Prix", race_date=date(2026, 3, 8))
CAT = {"Category:2026 Australian Grand Prix"}
PODIUM_CAT = {"Category:Podium at the 2026 Australian Grand Prix"}


def page(title, licence="CC BY-SA 4.0", licence_url="https://creativecommons.org/licenses/by-sa/4.0", artist='<a href="//x">Yu Chu Chin</a>',
         mime="image/jpeg", width=6000, height=4000, taken="2026-03-08 14:00:00", description="", restrictions=""):
    name = title.removeprefix("File:").replace(" ", "_")
    return {
        "title": title,
        "imageinfo": [{
            "url": f"https://upload.wikimedia.org/wikipedia/commons/a/ab/{name}?utm_source=x",
            "descriptionurl": f"https://commons.wikimedia.org/wiki/File:{name}",
            "mime": mime, "width": width, "height": height,
            "extmetadata": {
                "LicenseShortName": {"value": licence}, "LicenseUrl": {"value": licence_url}, "Artist": {"value": artist},
                "DateTimeOriginal": {"value": taken}, "ImageDescription": {"value": description}, "Restrictions": {"value": restrictions},
            },
        }],
    }


# --- licences: only CC0, public domain, CC BY and CC BY-SA ------------------------------------------------
for raw, want in [("CC BY-SA 4.0", "CC BY-SA 4.0"), ("CC BY 2.0", "CC BY 2.0"), ("cc-by-sa-3.0", "CC BY-SA 3.0"),
                  ("CC0", "CC0"), ("Public domain", "Public domain")]:
    assert rp.normalise_licence(raw) == want, (raw, rp.normalise_licence(raw))
for raw in ["CC BY-NC 4.0", "CC BY-ND 4.0", "CC BY-NC-SA 4.0", "Fair use", "All rights reserved", "", "GFDL", "CC BY-SA"]:
    assert rp.normalise_licence(raw) is None, raw

# --- the filters, one reason each --------------------------------------------------------------------------
good, why = rp.evaluate(page("File:Podium celebration at the 2026 Australian Grand Prix (028A8775).jpg"), RACE, PODIUM_CAT)
assert good and why is None, why
assert good.photographer == "Yu Chu Chin", "HTML stripped from the credit"
assert good.thumbnail_url.endswith("/500px-Podium_celebration_at_the_2026_Australian_Grand_Prix_(028A8775).jpg"), good.thumbnail_url
assert good.image_url.endswith("/1280px-Podium_celebration_at_the_2026_Australian_Grand_Prix_(028A8775).jpg")
assert "/commons/thumb/a/ab/" in good.image_url and "?" not in good.image_url
assert good.subject == "podium"

rejections = {
    "licence not allowed": page("File:a.jpg", licence="CC BY-NC 4.0"),
    "no licence URL": page("File:b.jpg", licence_url=""),
    "no photographer": page("File:c.jpg", artist="  "),
    "restricted": page("File:d.jpg", restrictions="trademarked"),
    "not a photo": page("File:e.png", mime="image/png"),
    "not Formula 1": page("File:Porsche 356 Carrera at the 2026 Australian Grand Prix (028A8454).jpg"),
    "not a race photo": page("File:Aerospatiale AS350B VH-EFT covering the 2026 Australian Grand Prix (028A8502).jpg"),
    "too small": page("File:f.jpg", width=1215, height=800),
    "not taken during the race weekend": page("File:2022 Miami Grand Prix.jpg", taken="2022-05-08"),
}
for want, p in rejections.items():
    cand, reason = rp.evaluate(p, RACE, CAT)
    assert cand is None and reason.startswith(want), (want, reason)
# A search hit must name the race; a category member already does by being in the category.
cand, reason = rp.evaluate(page("File:Melbourne skyline (IMG 1).jpg"), RACE, {"search"})
assert cand is None and reason.startswith("search hit"), reason
cand, _ = rp.evaluate(page("File:Melbourne (IMG 1).jpg", description="Fans at the 2026 Australian Grand Prix"), RACE, {"search"})
assert cand is not None
# Protocol-relative licence URLs become https.
cand, _ = rp.evaluate(page("File:g.jpg", licence_url="//creativecommons.org/licenses/by/4.0"), RACE, CAT)
assert cand.license_url == "https://creativecommons.org/licenses/by/4.0"

# --- grouping: one podium burst is one group; different cars shot seconds apart are not -----------------
def cand(title, cats=CAT, **kw):
    c, reason = rp.evaluate(page(title, **kw), RACE, cats)
    assert c, reason
    return c


podium = [cand(f"File:Podium celebration at the 2026 Australian Grand Prix (028A{n}).jpg", PODIUM_CAT) for n in (8767, 8775, 8788, 8796, 8810)]
cars = [cand("File:Haas VF-26 of Oliver Bearman (028A8486).jpg", taken="2026-03-07"),
        cand("File:Haas VF-26 of Oliver Bearman (028A8490).jpg", taken="2026-03-07"),
        cand("File:McLaren MCL40 of Oscar Piastri (028A8489).jpg", taken="2026-03-07"),
        cand("File:Alpine A526 of Pierre Gasly (028A8053).jpg", taken="2026-03-06")]
rp.group_bursts(podium + cars)
assert len({c.group_key for c in podium}) == 1, "a podium celebration is one burst"
assert cars[0].group_key == cars[1].group_key, "same car, consecutive frames"
assert len({cars[0].group_key, cars[2].group_key, cars[3].group_key}) == 3, "different cars are different photos"

# --- selection: subjects round-robin, at most MAX_GROUPS groups, alternates capped ------------------------
drivers = [cand(f"File:Driver {i} at the Melbourne Walk during the 2026 Australian Grand Prix (X{i}00).jpg", {"Category:Formula One drivers at the 2026 Australian Grand Prix"}) for i in range(1, 9)]
crowd = cand("File:Brabham Grandstand at the 2026 Australian Grand Prix (DSCF2692).jpg")
picked = rp.select(podium + cars + drivers + [crowd])
groups = []
for c in picked:
    if c.group_key not in groups:
        groups.append(c.group_key)
assert len(groups) == rp.MAX_GROUPS, len(groups)
first = [next(c for c in picked if c.group_key == g).subject for g in groups]
assert first[:4] == ["car", "podium", "driver", "atmosphere"], first
assert sum(1 for c in picked if c.subject == "podium") <= rp.MAX_FRAMES_PER_GROUP
assert not any(c.subject == "general" for c in picked), "no generic photo invented to fill a slot"
assert rp.select([]) == [], "no photos -> no candidates (and no fallback)"


# --- Wikimedia client: sequential, Retry-After honoured, long waits deferred ------------------------------
class Resp:
    def __init__(self, status, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body or {}, headers or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class Session:
    def __init__(self, responses):
        self.responses, self.headers, self.calls = list(responses), {}, 0

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        return self.responses.pop(0)


slept = []
wm = rp.Wikimedia(cache=False, sleep=slept.append, session=Session([Resp(429, headers={"Retry-After": "7"}), Resp(200, {"query": {}})]))
assert "ApexF1Hub" in wm.session.headers["User-Agent"] and "apexf1hub.com" in wm.session.headers["User-Agent"]
assert wm.get(action="query") == {"query": {}}
assert 7 in slept, f"waited as Retry-After asked: {slept}"
assert wm.requests_made == 2

wm = rp.Wikimedia(cache=False, sleep=slept.append, session=Session([Resp(429, headers={"Retry-After": "3600"})]))
try:
    wm.get(action="query")
    raise AssertionError("an hour's Retry-After must defer the scan, not sleep through it")
except rp.RateLimited:
    pass


# --- weekly re-check: deleted or no-longer-allowed photos are removed ---------------------------------------
class Cur:
    def __init__(self, rows):
        self.rows, self.sql, self.rowcount = rows, [], 0

    def execute(self, sql, params=None):
        self.sql.append((" ".join(sql.split()), params))
        self.rowcount = 0

    def fetchall(self):
        return self.rows


class FakeWm:
    def __init__(self, pages):
        self.pages = pages

    def files_by_title(self, titles):
        return self.pages


rows = [(1, RACE.id, "File:ok.jpg", 11), (2, RACE.id, "File:gone.jpg", 12), (3, RACE.id, "File:nc.jpg", 13)]
pages = [page("File:ok.jpg"), {"title": "File:gone.jpg", "missing": True}, page("File:nc.jpg", licence="CC BY-NC 4.0")]
cur = Cur(rows)
counts = rp.recheck(cur, FakeWm(pages))
assert counts == {"kept": 1, "updated": 0, "removed": 2}, counts
deleted = [p for s, p in cur.sql if s.startswith("delete from race_photos")]
assert deleted == [(2,), (3,)], deleted
assert any(s.startswith("update race_photo_candidates set status = 'rejected'") and p == (12,) for s, p in cur.sql)

print("race photos: all checks passed")
