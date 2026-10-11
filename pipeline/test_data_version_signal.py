"""Plain assert-based self-check (no pytest) for the freshness signal (audit R-19): open tabs are told to
refresh only after the server cache was actually busted. `python test_data_version_signal.py`."""

# --- the freshness signal: bumped only after a successful cache bust, only for tags a browser shows ----
import ergast_utils

bumped = []
ergast_utils.bump_data_version = lambda tag: bumped.append(tag)


class Resp:
    def __init__(self, ok, status):
        self.ok, self.status_code = ok, status


os_env = ergast_utils.os.environ
os_env["CRON_SECRET"] = "x"

ergast_utils.requests.post = lambda *a, **k: Resp(True, 200)
ergast_utils.trigger_revalidation("races")
assert bumped == ["races"], bumped

ergast_utils.requests.post = lambda *a, **k: Resp(False, 500)
ergast_utils.trigger_revalidation("races")
assert bumped == ["races"], "a failed bust must not tell tabs to refresh onto stale data"


def refuse(*a, **k):
    raise OSError("network down")


ergast_utils.requests.post = refuse
ergast_utils.trigger_revalidation("races")
assert bumped == ["races"], "no bust, no bump"

del os_env["CRON_SECRET"]
ergast_utils.requests.post = lambda *a, **k: Resp(True, 200)
ergast_utils.trigger_revalidation("calendar")
assert bumped == ["races"], "without the secret nothing was busted"

# the real function: archive tags are ignored, a database error never raises
real = ergast_utils.__dict__["bump_data_version"]
import importlib

importlib.reload(ergast_utils)
os_env["DATABASE_URL"] = "postgresql://u:p@localhost:1/db"
calls = []
ergast_utils.psycopg2.connect = lambda *a, **k: calls.append(1) or (_ for _ in ()).throw(OSError("refused"))
ergast_utils.bump_data_version("archive-data")
assert calls == [], "archive-data has no live viewers"
ergast_utils.bump_data_version("races")  # connection refused: warns, returns
assert calls == [1]
print("data_version signal: all checks passed")
