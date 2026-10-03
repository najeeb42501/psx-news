from __future__ import annotations

from collections.abc import Iterator

import pytest

from pipeline.config.settings import load_settings


@pytest.fixture(scope="session")
def pg_conn():
    """A real Postgres connection, or skip if DATABASE_URL is not set."""
    url = load_settings().database_url
    if not url:
        pytest.skip("DATABASE_URL not set; skipping Postgres tests")
    import psycopg

    from pipeline.adapters.repo.migrations import pending
    from pipeline.adapters.repo.postgres import connect

    conn = connect(url)
    try:
        missing = pending(conn)
    except psycopg.errors.UndefinedTable:
        missing = ["(schema_migrations table missing)"]
    if missing:
        conn.close()
        pytest.fail(f"Run `uv run python -m pipeline.jobs.migrate` first; pending: {missing}")
    yield conn
    conn.close()


@pytest.fixture
def pg_tx(pg_conn) -> Iterator:
    """Runs the test inside a transaction that is always rolled back."""
    with pg_conn.transaction(force_rollback=True):
        yield pg_conn
