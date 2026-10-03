# Changelog

## Phase 0 – Plan and setup (2026-10-03)

- Monorepo skeleton following the planned layout: `pipeline/` (Python 3.12, uv), `web/` (Next.js 16, TypeScript, Tailwind 4), `db/migrations/`, `.github/workflows/`.
- Domain models (`pipeline/core/models.py`) and the six interfaces from the design (`pipeline/core/interfaces.py`).
- Stub jobs (`ingest`, `process`, `compose`, `publish`) runnable with `uv run python -m pipeline.jobs.<name>`.
- `pipeline/container.py` and env-based `pipeline/config/settings.py`.
- A test enforcing that `pipeline/core/` never imports vendor SDKs.
- Website placeholder with the EN/UR disclaimer in the footer.
- `tests.yml` GitHub Actions workflow runs pytest, lint and the web build on every push.
- Brand: **ShareKhabar** (شیئر خبر), replacing the "PSX Alerts" placeholder. Name, tagline and contact email live in `web/lib/brand.ts` and `pipeline/config/settings.py`.

## Phase 1 – Database (2026-10-03)

- `db/migrations/001_init.sql`: tables from the design. `posts` uniqueness uses `NULLS NOT DISTINCT`, so a brief or an alert can't be queued twice even though some of its columns are NULL.
- `002_web_access.sql`: `web_items` and `web_companies` read-only views, row-level security on every table, and column-level grants. The public key sees only published items and never sees posts, sources or full document text.
- `003_search.sql`: `items.search` is filled automatically from the symbol, company name and EN/UR summaries.
- Migration runner (`pipeline.jobs.migrate`), tracked in `schema_migrations`.
- `Repository` interface extended (companies, sources, summaries, reads). `PostgresRepository` adapter with idempotent upserts. `InMemoryRepository` fake for tests.
- Contract tests run on both the fake and real Postgres. Access tests act as the website's public role.
- CI runs the DB tests against a throwaway Postgres 17.
