"""migrate job: apply pending SQL migrations from db/migrations/.

Run with: uv run python -m pipeline.jobs.migrate
"""
from __future__ import annotations

import sys

from pipeline.adapters.repo.migrations import apply_migrations
from pipeline.config.settings import load_settings


def main() -> int:
    settings = load_settings()
    if not settings.database_url:
        print("migrate: DATABASE_URL is not set (see .env.example)")
        return 1
    applied = apply_migrations(settings.database_url)
    print(f"migrate: applied {applied}" if applied else "migrate: already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
