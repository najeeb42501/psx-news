"""publish job: Send queued posts to Facebook and X; mark WhatsApp posts ready.

Run with: uv run python -m pipeline.jobs.publish
"""
from __future__ import annotations

import sys

from pipeline.container import build_container


def main() -> int:
    build_container()
    print("publish: not implemented yet (Phase 5)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
