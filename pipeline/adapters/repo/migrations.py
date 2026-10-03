"""Applies db/migrations/*.sql in order, once each, on any Postgres host."""
from __future__ import annotations

from pathlib import Path

import psycopg
from psycopg.rows import tuple_row

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "db" / "migrations"


def pending(conn: psycopg.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> list[Path]:
    with conn.cursor(row_factory=tuple_row) as cur:
        applied = {r[0] for r in cur.execute("select version from schema_migrations").fetchall()}
    return [p for p in sorted(migrations_dir.glob("*.sql")) if p.stem not in applied]


def apply_migrations(database_url: str, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply pending migrations; each file runs in one transaction. Returns names applied."""
    done: list[str] = []
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(
            "create table if not exists schema_migrations ("
            " version text primary key, applied_at timestamptz default now())"
        )
        conn.execute("alter table schema_migrations enable row level security")
        for path in pending(conn, migrations_dir):
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute("insert into schema_migrations (version) values (%s)", (path.stem,))
            done.append(path.stem)
    return done
