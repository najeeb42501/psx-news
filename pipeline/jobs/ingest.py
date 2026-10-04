"""ingest job: fetch new items from all enabled sources, extract text, store documents.

Run with:
  uv run python -m pipeline.jobs.ingest                    # normal run (since each source's last run)
  uv run python -m pipeline.jobs.ingest --date 2026-10-02  # one Pakistan-time day (backfill/check)
  uv run python -m pipeline.jobs.ingest --source psx_companies
"""
from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from pipeline.container import Container, build_container
from pipeline.core.ingest import IngestResult, ingest_source

PKT = ZoneInfo("Asia/Karachi")
OVERLAP = timedelta(hours=1)  # re-check a little before the last run, in case of late listings
MAX_LOOKBACK = timedelta(days=7)


def window_start(last_success: datetime | None, last_run: datetime | None, now: datetime) -> datetime:
    """Where a normal run starts: just before everything captured so far.
    The first run of a Pakistan day also re-lists all of yesterday, so filings the portal
    lists late (after our last run of that day) are still caught."""
    mark = last_success or last_run or now - timedelta(days=1)
    since = mark - OVERLAP
    today = now.astimezone(PKT).replace(hour=0, minute=0, second=0, microsecond=0)
    if mark < today:
        since = min(since, today - timedelta(days=1))
    return max(since, now - MAX_LOOKBACK)


def seed_companies_if_empty(c: Container) -> None:
    if not c.repo.known_symbols():
        companies = c.psx_client.symbols()
        c.repo.upsert_companies(companies)
        print(f"seeded {len(companies)} companies from PSX")


def run(c: Container, day: str | None = None, only: str | None = None) -> list[IngestResult]:
    for record in c.source_records():
        c.repo.upsert_source(record)
    seed_companies_if_empty(c)

    now = datetime.now(UTC)
    results = []
    for source in c.sources(only):
        if day:
            start = datetime.fromisoformat(day).replace(tzinfo=PKT)
            since, until = start, start + timedelta(days=1) - timedelta(seconds=1)
        else:
            record = c.repo.get_source(source.id)
            since = window_start(record.last_success_at if record else None,
                                 record.last_run_at if record else None, now)
            until = None
        result = ingest_source(source, c.repo, c.parser, since, until)
        results.append(result)
        print(
            f"{source.id:24} fetched={result.fetched:4} new={result.new:4} "
            f"known={result.already_known:4} failed={result.failed:3}  {result.seconds:5.1f}s"
        )
        for err in result.errors[:5]:
            print(f"    ! {err}")
    return results


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", help="ingest one Pakistan-time day, YYYY-MM-DD")
    ap.add_argument("--source", help="only this source id (see config/sources.yaml)")
    args = ap.parse_args(argv)
    run(build_container(), args.date, args.source)
    return 0


if __name__ == "__main__":
    sys.exit(main())
