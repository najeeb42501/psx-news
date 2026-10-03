"""compose job: Create posts for importance-3 items, the morning brief and the evening digest.

Run with: uv run python -m pipeline.jobs.compose
"""
from __future__ import annotations

import sys

from pipeline.container import build_container


def main() -> int:
    build_container()
    print("compose: not implemented yet (Phase 5)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
