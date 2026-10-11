"""Plain assert-based self-check (no pytest) for the pipeline's write discipline (audit R-15):
a round's writes commit together or not at all, and an upsert that would change nothing writes
nothing. `python test_pipeline_writes.py`.

The SQL is checked against a recording cursor here; the same helpers are exercised against a real
Postgres by the staging check described in pipeline/README.md.
"""

import ast
from pathlib import Path

import psycopg2.extras

import ergast_utils
from ergast_utils import transaction, upsert


class Recorder:
    def __init__(self):
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append(sql)


# --- transaction: BEGIN ... COMMIT on success --------------------------------------------------
cur = Recorder()
with transaction(cur):
    cur.execute("insert 1")
    cur.execute("insert 2")
assert cur.statements == ["begin", "insert 1", "insert 2", "commit"], cur.statements

# --- an exception after the first write rolls everything back and still propagates ------------
cur = Recorder()
try:
    with transaction(cur):
        cur.execute("upsert races")
        raise RuntimeError("boom after the races upsert")
except RuntimeError as exc:
    assert "boom" in str(exc)
else:
    raise AssertionError("the exception must propagate so the job turns red")
assert cur.statements == ["begin", "upsert races", "rollback"], cur.statements
assert "commit" not in cur.statements

# --- a dead connection cannot mask the original error -------------------------------------------
class Dead(Recorder):
    def execute(self, sql, params=None):
        if sql == "rollback":
            raise OSError("connection already closed")
        super().execute(sql, params)


try:
    with transaction(Dead()):
        raise ValueError("original")
except ValueError as exc:
    assert str(exc) == "original"

# --- Ctrl-C / SystemExit also roll back --------------------------------------------------------
cur = Recorder()
try:
    with transaction(cur):
        raise SystemExit(1)
except SystemExit:
    pass
assert cur.statements[-1] == "rollback", cur.statements

# --- upsert: unchanged rows are skipped only when asked ----------------------------------------
captured = []
psycopg2.extras.execute_values = lambda cursor, query, values: captured.append(query)
rows = [{"id": "r1", "name": "Bahrain", "updated_at": "2026-10-04T00:00:00Z"}]

upsert(Recorder(), "races", rows, ["id"])
assert "is distinct from" not in captured[-1], captured[-1]

upsert(Recorder(), "races", rows, ["id"], skip_unchanged=True, unchanged_ignore=("updated_at",))
q = captured[-1]
assert "where (races.name) is distinct from (excluded.name)" in q, q
assert "updated_at=excluded.updated_at" in q, "the timestamp is still written along with a real change"
assert "races.updated_at" not in q.split("where", 1)[1], "but it must not count as a change itself"

# keep_known columns compare against what the update would actually store
rows = [{"race_id": "r1", "lap_number": 1, "driver": "HAM", "position": None, "time": 90.1}]
upsert(Recorder(), "race_laps", rows, ["race_id", "lap_number", "driver"], keep_known_cols=("position", "time"), skip_unchanged=True)
q = captured[-1]
assert "coalesce(excluded.position, race_laps.position)" in q.split("where", 1)[1], q

# a table with nothing but its key has nothing to compare: plain upsert, no empty where clause
upsert(Recorder(), "tags", [{"id": 1}], ["id"], skip_unchanged=True)
assert "is distinct from" not in captured[-1], captured[-1]


# --- structure: a round's writes cannot drift back outside the transaction ---------------------
source = (Path(__file__).parent / "fetch_races.py").read_text()
tree = ast.parse(source)
build = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "build_and_push")

inside = set()
for node in ast.walk(build):
    if isinstance(node, ast.With) and any(
        isinstance(i.context_expr, ast.Call) and getattr(i.context_expr.func, "id", "") == "transaction" for i in node.items
    ):
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                inside.add(id(child))

writes = [
    n
    for n in ast.walk(build)
    if isinstance(n, ast.Call) and getattr(n.func, "id", "") in ("upsert", "prune", "sync_roster")
]
assert len(writes) >= 7, f"expected the races/roster/inputs/results/stints/laps writes, found {len(writes)}"
outside = [ast.get_source_segment(source, n)[:60] for n in writes if id(n) not in inside]
assert not outside, f"writes outside the round's transaction: {outside}"

# the races row is the first write in the transaction, so a child table's foreign key always resolves
first_write = min(writes, key=lambda n: (n.lineno, n.col_offset))
assert first_write.args[1].value == "races", ast.get_source_segment(source, first_write)

print("pipeline writes: all checks passed")
