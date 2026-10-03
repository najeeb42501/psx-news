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
            last = record.last_run_at if record and record.last_run_at else now - timedelta(days=1)
            since, until = max(last - OVERLAP, now - MAX_LOOKBACK), None
        result = ingest_source(source, c.repo, c.parser, since, until)
        results.append(result)
        print(
            f"{source.id:24} fetched={result.fetched:4} new={result.new:4} "
            f"known={result.already_known:4} failed={result.failed:3}"
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
