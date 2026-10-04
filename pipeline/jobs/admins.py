"""admins job: manage who can sign in to the admin area (table admin_users).

  uv run python -m pipeline.jobs.admins list
  uv run python -m pipeline.jobs.admins add you@example.com
  uv run python -m pipeline.jobs.admins remove you@example.com   # also ends their sessions
"""
from __future__ import annotations

import argparse
import sys

import psycopg

from pipeline.config.settings import load_settings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=("list", "add", "remove"))
    ap.add_argument("email", nargs="?")
    args = ap.parse_args(argv)
    if args.action != "list" and not args.email:
        ap.error("an email is required")
    email = (args.email or "").strip().lower()
    with psycopg.connect(load_settings().database_url, autocommit=True) as conn:
        if args.action == "add":
            conn.execute("insert into admin_users (email) values (%s) on conflict do nothing", (email,))
        elif args.action == "remove":
            conn.execute("delete from admin_users where email = %s", (email,))
        for (row,) in conn.execute("select email from admin_users order by email"):
            print(row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
