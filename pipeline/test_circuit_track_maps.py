"""Plain assert-based self-check (no pytest, no network) for the circuit track map pipeline: title parsing,
the 960px rendition URL, the licence allow-list and attribution checks, batched lookups that follow
normalisation and redirects, and the all-or-nothing database write. `python test_circuit_track_maps.py`."""

import circuit_track_maps as tm
import race_photos as rp

# --- titles from wikipedia_url ------------------------------------------------------------------------------
assert tm.title_from_url("http://en.wikipedia.org/wiki/Marina_Bay_Street_Circuit") == "Marina Bay Street Circuit"
assert tm.title_from_url("https://en.wikipedia.org/wiki/Aut%C3%B3dromo_Hermanos_Rodr%C3%ADguez") == "Autódromo Hermanos Rodríguez"
assert tm.title_from_url("https://de.wikipedia.org/wiki/Nürburgring") is None, "English Wikipedia only"
assert tm.title_from_url(None) is None and tm.title_from_url("") is None

# --- the map URL: a standard width, SVG as PNG, small rasters as their original ---------------------------
SVG = "https://upload.wikimedia.org/wikipedia/commons/8/8b/Marina_Bay_circuit_2023.svg?utm_source=x"
assert tm.map_url(SVG, 1000, "image/svg+xml") == \
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Marina_Bay_circuit_2023.svg/960px-Marina_Bay_circuit_2023.svg.png"
PNG = "https://upload.wikimedia.org/wikipedia/commons/7/78/Zandvoort_Circuit.png"
assert tm.map_url(PNG, 3000, "image/png") == "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Zandvoort_Circuit.png/960px-Zandvoort_Circuit.png"
assert tm.map_url(PNG, 800, "image/png") == PNG, "never ask Wikimedia to upscale"
assert tm.MAP_WIDTH in (330, 500, 960, 1280, 1920)


def page(name="Marina_Bay_circuit_2023.svg", licence="CC BY-SA 4.0", licence_url="https://creativecommons.org/licenses/by-sa/4.0",
         artist='<a href="//commons.wikimedia.org/wiki/User:Cherkash">Cherkash</a>', mime="image/svg+xml", restrictions=""):
    return {
        "title": f"File:{name.replace('_', ' ')}",
        "imageinfo": [{
            "url": f"https://upload.wikimedia.org/wikipedia/commons/8/8b/{name}",
            "descriptionurl": f"https://commons.wikimedia.org/wiki/File:{name}",
            "mime": mime, "width": 1200, "height": 800,
            "extmetadata": {"LicenseShortName": {"value": licence}, "LicenseUrl": {"value": licence_url},
                            "Artist": {"value": artist}, "Restrictions": {"value": restrictions}},
        }],
    }


m, reason = tm.evaluate(page())
assert reason is None and m, reason
assert m.credit == "Cherkash", "author's HTML stripped"
assert m.license == "CC BY-SA 4.0" and m.license_url == "https://creativecommons.org/licenses/by-sa/4.0"
assert m.source_url == "https://commons.wikimedia.org/wiki/File:Marina_Bay_circuit_2023.svg"
assert m.url.endswith("/960px-Marina_Bay_circuit_2023.svg.png")

for ok in ["CC0", "Public domain", "CC BY 2.0", "CC BY-SA 3.0"]:
    assert tm.evaluate(page(licence=ok))[0], ok
for bad in ["CC BY-NC 4.0", "CC BY-ND 4.0", "CC BY-NC-SA 2.0", "Fair use", ""]:
    m, reason = tm.evaluate(page(licence=bad))
    assert m is None and reason.startswith("licence not allowed"), (bad, reason)
assert tm.evaluate(page(artist="  "))[1] == "no author for the credit"
assert tm.evaluate(page(licence_url=""))[1] == "no licence URL"
assert tm.evaluate(page(licence_url="//creativecommons.org/x"))[0].license_url == "https://creativecommons.org/x"
assert tm.evaluate(page(restrictions="trademarked"))[0] is None
assert tm.evaluate({"title": "File:Gone.svg", "missing": True})[1] == "file not on Commons"
assert tm.evaluate(None)[0] is None


# --- batched lookups: one request per 50 titles, normalisation and redirects followed ----------------------
class FakeWiki:
    def __init__(self, responder):
        self.responder, self.calls, self.requests_made = responder, [], 0

    def get(self, **params):
        self.calls.append(params)
        self.requests_made += 1
        return self.responder(params)


ARTICLE_IMAGES = {
    # Lead image is a photo or a logo: the article's own track map is used instead.
    "Speedway Circuit": ["File:Commons-logo.svg", "File:Grandstand photo.jpg", "File:Speedway road course.svg"],
    "Logo Lead Circuit": ["File:Logo Lead Circuit Logo.svg", "File:Corniche track map.svg"],
    "Fair Use Circuit": ["File:Some aerial view.jpg"],
}


def wikipedia(params):
    titles = params["titles"].split("|")
    if params.get("prop") == "images":
        return {"query": {"pages": [{"title": t, "images": [{"title": f} for f in ARTICLE_IMAGES.get(t, [])]} for t in titles]}}
    assert params["ppprop"] == "page_image_free", "only the free lead image is ever used"
    pages, redirects = [], []
    for t in titles:
        if t == "Speedway Circuit":
            pages.append({"title": t, "pageprops": {"page_image_free": "Indianapolis-motor-speedway-1848561.jpg"}})
        elif t == "Logo Lead Circuit":
            pages.append({"title": t, "pageprops": {"page_image_free": "Jeddah_Corniche_Circuit_Logo.svg"}})
        elif t == "Monza":
            redirects.append({"from": "Monza", "to": "Monza Circuit"})
            pages.append({"title": "Monza Circuit", "pageprops": {"page_image_free": "Monza_track_map.svg"}})
        elif t == "Fair Use Circuit":
            pages.append({"title": t, "pageprops": {}})   # only a non-free image: no map
        elif t.startswith("Circuit "):
            pages.append({"title": t, "pageprops": {"page_image_free": f"{t.replace(' ', '_')}.svg"}})
        else:
            pages.append({"title": t, "missing": True})
    return {"query": {"pages": pages, "redirects": redirects}}


def commons(params):
    out = []
    for f in params["titles"].split("|"):
        p = page(name=f.removeprefix("File:").replace(" ", "_"))
        p["title"] = f
        out.append(p)
    return {"query": {"pages": out}}


wp, cm = FakeWiki(wikipedia), FakeWiki(commons)
titles = ["Monza", "Fair Use Circuit", "Nowhere", "Speedway Circuit", "Logo Lead Circuit"] + [f"Circuit {i}" for i in range(60)]
results = tm.find_maps(wp, cm, titles)
lead_calls = [c for c in wp.calls if c.get("ppprop")]
assert len(lead_calls) == 2 and len(cm.calls) == 2, "lead images and file pages batched 50 at a time"
assert all(len(c["titles"].split("|")) <= 50 for c in lead_calls + cm.calls)
assert results["Monza"][0].file == "File:Monza track map.svg", "redirect followed back to the asked title"
assert results["Fair Use Circuit"] == (None, "no track map on the article"), "a photo is never a map"
assert results["Speedway Circuit"][0].file == "File:Speedway road course.svg", "photo lead image skipped for the article's map"
assert results["Logo Lead Circuit"][0].file == "File:Corniche track map.svg", "logo lead image skipped for the article's map"

# What counts as a map file.
assert tm.is_map_file("File:Monza track map.svg") and tm.is_map_file("File:Zandvoort Circuit.png")
for f in ["File:Indianapolis-motor-speedway-1848561.jpg", "File:Sirius track.jpg", "File:Jeddah Corniche Circuit Logo.svg", "File:Logo Brands Hatch Circuit.svg"]:
    assert not tm.is_map_file(f), f
assert not tm.is_map_file("File:Flag of Italy.svg", named_like_map=True)
assert not tm.is_map_file("File:Jeddah Formula E Layout.png", named_like_map=True) and not tm.is_map_file("File:Long Beach Street Circuit IndyCar.svg"), "another series' layout is not the F1 track"
assert not tm.is_map_file("File:Jeddah Corniche Circuit viewed from above.png", named_like_map=True), "an aerial view is not a map"
assert not tm.is_map_file("File:Some building.svg", named_like_map=True), "fallback images must be named like a map"

# Public domain and CC0 carry no LicenseUrl on Commons: the canonical deed is used.
assert tm.evaluate(page(licence="Public domain", licence_url=""))[0].license_url == "https://creativecommons.org/publicdomain/mark/1.0/"
assert tm.evaluate(page(licence="CC0", licence_url=""))[0].license_url == "https://creativecommons.org/publicdomain/zero/1.0/"
assert results["Nowhere"][0] is None
assert results["Circuit 59"][0] is not None


# --- the write: a full map, or all six columns cleared -----------------------------------------------------
class Cur:
    def __init__(self, rowcount=1):
        self.sql, self.rowcount = [], rowcount

    def execute(self, sql, params=None):
        self.sql.append((sql, params))


cur = Cur()
m = tm.evaluate(page())[0]
assert tm.store(cur, "marina_bay", m) is True
assert "track_map_checked_at = now()" in cur.sql[0][0] and cur.sql[0][1][:5] == (m.url, m.source_url, m.credit, m.license, m.license_url)

cur = Cur()
assert tm.store(cur, "marina_bay", None) is True
cleared = cur.sql[0][0]
for col in ["track_map_url", "track_map_source_url", "track_map_credit", "track_map_license", "track_map_license_url", "track_map_checked_at"]:
    assert f"{col} = null" in cleared, f"{col} cleared with the rest"

cur = Cur(rowcount=0)
assert tm.store(cur, "marina_bay", m) is False and len(cur.sql) == 2, "unchanged map: only checked_at refreshed"

# --- the shared client can talk to Wikipedia without changing Commons' behaviour ---------------------------
assert rp.Wikimedia(cache=False).api == rp.API
assert rp.Wikimedia(cache=False, api=rp.WIKIPEDIA_API).api == "https://en.wikipedia.org/w/api.php"
a, b = rp.Wikimedia(cache=False), rp.Wikimedia(cache=False, api=rp.WIKIPEDIA_API)
assert a._cache_path({"x": 1}) != b._cache_path({"x": 1}), "the two wikis never share a cache entry"

print("circuit track maps: all checks passed")
