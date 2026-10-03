"""process job: Classify, extract facts, summarise EN + UR and run the quality gate.

Run with: uv run python -m pipeline.jobs.process
"""
from __future__ import annotations

import sys

from pipeline.container import build_container


def main() -> int:
    build_container()
    print("process: not implemented yet (Phase 3)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
