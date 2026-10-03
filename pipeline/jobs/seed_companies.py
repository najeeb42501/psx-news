"""seed_companies job: load/refresh the companies table from PSX's symbol list.

Run with: uv run python -m pipeline.jobs.seed_companies
"""
from __future__ import annotations

import sys

from pipeline.container import build_container


def main() -> int:
    c = build_container()
    companies = c.psx_client.symbols()
    c.repo.upsert_companies(companies)
    print(f"seed_companies: {len(companies)} companies upserted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
