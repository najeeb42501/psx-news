"""run job: run ingest and/or process as one recorded run (shown on the admin Jobs page).

Only one run at a time. The admin page starts this; it also works from the command line:
  uv run python -m pipeline.jobs.run --job pipeline                 # fetch new items, then summarise them
  uv run python -m pipeline.jobs.run --job ingest --date 2026-10-02 # fetch one Pakistan-time day
  uv run python -m pipeline.jobs.run --job process --max-ai 40
"""
from __future__ import annotations

import argparse
import io
import sys
import traceback
from contextlib import redirect_stdout
from dataclasses import asdict

from pipeline.container import build_container
from pipeline.jobs import ingest, process

JOBS = ("ingest", "process", "pipeline")


class _Tee(io.TextIOBase):
    """Write to the console and keep a copy for the run's log."""

    def __init__(self, *streams) -> None:
        self.streams = streams

    def write(self, s: str) -> int:
        for st in self.streams:
            st.write(s)
        return len(s)

    def flush(self) -> None:
        for st in self.streams:
            st.flush()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--job", choices=JOBS, default="pipeline")
    ap.add_argument("--date", help="ingest one Pakistan-time day, YYYY-MM-DD")
    ap.add_argument("--source", help="only this source id")
    ap.add_argument("--max-ai", type=int, default=25)
    ap.add_argument("--triggered-by", default="cli", choices=("cli", "admin", "schedule"))
    args = ap.parse_args(argv)

    c = build_container()
    busy = c.repo.running_job_run()
    if busy:
        print(f"run: job run #{busy} is still in progress; not starting another one")
        return 2

    params = {k: v for k, v in {"date": args.date, "source": args.source, "max_ai": args.max_ai}.items() if v}
    run_id = c.repo.start_job_run(args.job, params, args.triggered_by)
    log = io.StringIO()
    summary: dict = {}
    status = "success"
    try:
        with redirect_stdout(_Tee(sys.stdout, log)):
            print(f"run #{run_id}: {args.job} {params}")
            if args.job in ("ingest", "pipeline"):
                results = ingest.run(c, args.date, args.source)
                summary["ingest"] = [asdict(r) for r in results]
                if results and all(r.source_error for r in results):
                    status = "failed"
            if args.job in ("process", "pipeline"):
                stats = process.run(c, args.max_ai)
                summary["process"] = {
                    "processed": stats.processed, "needs_review": stats.needs_review, "failed": stats.failed,
                    "deferred": stats.deferred, "by_category": dict(stats.by_category), "notes": stats.notes[:20],
                }
    except Exception:  # noqa: BLE001 - record any crash in the run log
        status = "failed"
        log.write(traceback.format_exc())
        traceback.print_exc()
    finally:
        c.repo.finish_job_run(run_id, status, summary, log.getvalue())
    print(f"run #{run_id}: {status}")
    return 0 if status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
