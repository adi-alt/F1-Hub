"""Plain assert-based self-check (no pytest, nothing to install): `python test_media_scripts_dry_run.py`.

shrink_media_storage.py and trim_media_storage.py delete files from Storage and rewrite database rows,
neither undoable (audit R-27). Without --apply they must change nothing at all; with it they must do
the work. The network and the database are faked; nothing real is touched.
"""

import os
import sys

os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "postgresql://unused")

import shrink_media_storage as shrink  # noqa: E402
import trim_media_storage as trim  # noqa: E402

BASE = "https://example.invalid/storage/v1/object/public/media/"


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.writes = []

    def execute(self, sql, params=None):
        if sql.strip().lower().startswith("update"):
            self.writes.append((sql, params))

    def fetchall(self):
        return self.rows


class FakeRequests:
    def __init__(self):
        self.calls = []

    def _record(self, verb):
        def call(url, **kwargs):
            self.calls.append((verb, url))

            class Response:
                content = b"x"

                def raise_for_status(self):
                    pass

            return Response()

        return call


def run(apply: bool, which):
    fake = FakeRequests()
    for verb in ("get", "post", "delete"):
        setattr(shrink.requests, verb, fake._record(verb))
    shrink._resize_photo = lambda content: content
    shrink.would_delete_files = 0
    shrink.would_update_rows = 0
    sys.argv = ["x"] + (["--apply"] if apply else [])
    urls = [f"{BASE}races/r_{i}.png" for i in range(5)]
    cur = FakeCursor([("race1", urls)])
    which(cur)
    return fake, cur


# trim: keeps TRIM_TO of 5 photos, so 3 files and 1 row are affected.
fake, cur = run(False, lambda c: trim.trim_table(c, "races", "id", "photo_urls"))
assert fake.calls == [], f"a dry run touched the network: {fake.calls}"
assert cur.writes == [], f"a dry run wrote to the database: {cur.writes}"
assert shrink.would_delete_files == 3 and shrink.would_update_rows == 1, (shrink.would_delete_files, shrink.would_update_rows)

fake, cur = run(True, lambda c: trim.trim_table(c, "races", "id", "photo_urls"))
assert [v for v, _ in fake.calls] == ["delete"], fake.calls
assert len(cur.writes) == 1 and cur.writes[0][1][0] == [f"{BASE}races/r_{i}.png" for i in range(trim.TRIM_TO)], cur.writes

# shrink: keeps KEEP_PER_ROW, deletes the rest, and (only when applying) recompresses what it kept.
fake, cur = run(False, lambda c: shrink.shrink_gallery_table(c, "races", "id", "photo_urls"))
assert fake.calls == [] and cur.writes == [], (fake.calls, cur.writes)

fake, cur = run(True, lambda c: shrink.shrink_gallery_table(c, "races", "id", "photo_urls"))
verbs = [v for v, _ in fake.calls]
assert verbs.count("delete") == 1 and verbs.count("get") == shrink.KEEP_PER_ROW and verbs.count("post") == shrink.KEEP_PER_ROW, verbs
assert len(cur.writes) == 1, cur.writes

# the single-photo table is only recompressed, and never in a dry run.
fake, cur = run(False, lambda c: shrink.shrink_single_photo_table(FakeCursor([("d1", f"{BASE}drivers/d.jpg")]), "archive_drivers", "driver_id", "photo_url"))
assert fake.calls == [], fake.calls

print("media scripts: a dry run changes nothing, --apply does the work: ok")
