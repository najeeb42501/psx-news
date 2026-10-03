"""ingest job: Fetch new items from all enabled sources, hash them and extract PDF text.

Run with: uv run python -m pipeline.jobs.ingest
"""
from __future__ import annotations

import sys

from pipeline.container import build_container


def main() -> int:
    build_container()
    print("ingest: not implemented yet (Phase 2)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
