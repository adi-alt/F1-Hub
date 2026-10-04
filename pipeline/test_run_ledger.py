"""Plain assert-based self-check (no pytest) for the run ledger (audit R-13/R-16): each job's outcome is
recorded, and the ledger can never change a job's result. `python test_run_ledger.py`."""

import os

import psycopg2

import run_ledger
from run_ledger import ledgered

os.environ["DATABASE_URL"] = "postgresql://user:pw@localhost:1/db"
os.environ.pop("SENTRY_DSN", None)


class FakeCursor:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.log.append((" ".join(sql.split()), params))

    def fetchone(self):
        return (7,)


class FakeConn:
    def __init__(self, log):
        self.log = log
        self.autocommit = False
        self.closed = False

    def cursor(self):
        return FakeCursor(self.log)

    def close(self):
        self.closed = True


def with_fake_db():
    log = []
    psycopg2.connect = lambda url, **kw: FakeConn(log)
    return log


def statuses(log):
    return [p[0] for s, p in log if s.startswith("update pipeline_runs")]


# success: a 'running' row first, then 'success'
log = with_fake_db()
assert ledgered("fetch-races")(lambda: 0)() == 0
assert log[0][0].startswith("insert into pipeline_runs") and log[0][1] == ("fetch-races",), log[0]
assert any(s.startswith("delete from pipeline_runs") for s, _ in log), "old rows are trimmed"
assert statuses(log) == ["success"], log

# a non-zero return (what main() uses for 'a person should look at this') is a failed run, result unchanged
log = with_fake_db()
assert ledgered("fetch-races")(lambda: 1)() == 1
assert statuses(log) == ["failed"], log

# an exception: recorded as failed, the SAME exception still propagates
log = with_fake_db()
def boom():
    raise ValueError("bad row")
try:
    ledgered("train-predict")(boom)()
except ValueError as exc:
    assert str(exc) == "bad row"
else:
    raise AssertionError("must propagate")
assert statuses(log) == ["failed"], log
assert "ValueError: bad row" in log[-1][1][1], log[-1]

# SystemExit(0) is success, SystemExit(2) is failed; both still exit
for code, expected in ((0, "success"), (None, "success"), (2, "failed")):
    log = with_fake_db()
    def leave():
        raise SystemExit(code)
    try:
        ledgered("data-audit")(leave)()
    except SystemExit as exc:
        assert exc.code == code
    assert statuses(log) == [expected], (code, log)

# the ledger being unavailable (table missing, database down) never changes the job
def refuse(url, **kw):
    raise psycopg2.OperationalError("could not connect")
psycopg2.connect = refuse
assert ledgered("fetch-races")(lambda: 0)() == 0
assert ledgered("fetch-races")(lambda: 1)() == 1

class MissingTable(FakeConn):
    def cursor(self):
        raise psycopg2.errors.UndefinedTable('relation "pipeline_runs" does not exist')
psycopg2.connect = lambda url, **kw: MissingTable([])
assert ledgered("fetch-races")(lambda: 0)() == 0

# no DATABASE_URL: nothing is attempted
del os.environ["DATABASE_URL"]
psycopg2.connect = lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not connect"))
assert ledgered("fetch-races")(lambda: 0)() == 0

# an error message is truncated, never a full traceback or a connection string
assert run_ledger.ERROR_CHARS <= 300
assert len(run_ledger._error_detail(ValueError("x" * 5000))["error"]) <= 300

print("run ledger: all checks passed")
