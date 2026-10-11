"""Records each pipeline job in `pipeline_runs` (audit R-13/R-16) and reports failures to Sentry, so
"did the pipeline run, and when did it last succeed?" doesn't depend on scrolling GitHub's run history.
/api/health reads the ledger; the heartbeat alert reads /api/health.

Strictly best-effort: the ledger and Sentry exist to observe the pipeline, so a missing table (the
migration not yet applied), an unreachable database or a missing DSN is a warning and the job carries on
exactly as it would have. Nothing here changes a job's result or exit code.

    @ledgered("fetch-races")
    def main(): ...          # a non-zero return value, or an exception, records the run as failed
"""

from __future__ import annotations

import functools
import os
import sys

import psycopg2

RETENTION_DAYS = 30
ERROR_CHARS = 300


class _Ledger:
    """One connection of its own: the job's transaction state must never be shared with bookkeeping."""

    def __init__(self, job: str):
        self.job = job
        self.conn = None
        self.run_id = None
        self._open()

    def _warn(self, what: str, exc: Exception) -> None:
        print(f"run ledger: {what} ({type(exc).__name__}); carrying on without it", file=sys.stderr)
        self.conn = None

    def _open(self) -> None:
        url = os.environ.get("DATABASE_URL")
        if not url:
            return
        try:
            self.conn = psycopg2.connect(url, connect_timeout=10)
            self.conn.autocommit = True
            with self.conn.cursor() as cur:
                cur.execute("insert into pipeline_runs (job, status) values (%s, 'running') returning id", (self.job,))
                self.run_id = cur.fetchone()[0]
                cur.execute(
                    "delete from pipeline_runs where job = %s and started_at < now() - make_interval(days => %s)",
                    (self.job, RETENTION_DAYS),
                )
        except Exception as exc:  # noqa: BLE001 - observability must never fail the job
            self._warn("could not start a record", exc)

    def finish(self, status: str, detail: dict | None = None) -> None:
        if not self.conn or self.run_id is None:
            return
        try:
            import json

            with self.conn.cursor() as cur:
                cur.execute(
                    "update pipeline_runs set status = %s, finished_at = now(), detail = %s where id = %s",
                    (status, json.dumps(detail) if detail else None, self.run_id),
                )
            self.conn.close()
        except Exception as exc:  # noqa: BLE001
            self._warn("could not finish the record", exc)


def _init_sentry(job: str):
    """Sentry only when SENTRY_DSN is set; returns the module or None."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return None
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=dsn, send_default_pii=False, traces_sample_rate=0, environment=os.environ.get("SENTRY_ENVIRONMENT", "pipeline"))
        sentry_sdk.set_tag("pipeline_job", job)
        return sentry_sdk
    except Exception as exc:  # noqa: BLE001
        print(f"run ledger: Sentry unavailable ({type(exc).__name__})", file=sys.stderr)
        return None


def _error_detail(exc: BaseException) -> dict:
    # The type and a short message only: enough to see why a run failed without a traceback in a table.
    return {"error": f"{type(exc).__name__}: {exc}"[:ERROR_CHARS]}


def ledgered(job: str):
    def wrap(fn):
        @functools.wraps(fn)
        def run(*args, **kwargs):
            sentry = _init_sentry(job)
            ledger = _Ledger(job)
            try:
                result = fn(*args, **kwargs)
            except SystemExit as exc:
                ok = exc.code in (0, None)
                ledger.finish("success" if ok else "failed", None if ok else {"error": f"exit {exc.code}"[:ERROR_CHARS]})
                raise
            except BaseException as exc:
                ledger.finish("failed", _error_detail(exc))
                if sentry is not None:
                    sentry.capture_exception(exc)
                    sentry.flush(timeout=5)
                raise
            failed = isinstance(result, int) and result != 0
            ledger.finish("failed" if failed else "success", {"exit": result} if failed else None)
            if failed and sentry is not None:
                sentry.capture_message(f"pipeline job {job} exited {result}", level="error")
                sentry.flush(timeout=5)
            return result

        return run

    return wrap
