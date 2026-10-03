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

## Phase 2 – Data ingestion (2026-10-04)

- PSX portal sources, built from inspecting the real pages:
  - The portal requires a per-page request token (`X-Req-Id`).
  - Company announcements, PSX notices and SECP notices share one adapter (`type` C, E or B).
  - Symbols for notices are read from the title and kept only if the company is listed.
- RSS source keeps headline, link and a description of at most 600 characters, with an optional keyword filter (used for Business Recorder).
- Text extraction: pdfplumber plus Tesseract OCR.
  - Most PSX PDFs are scans.
  - Image-only notices are OCR'd from the portal's GIF.
  - Urdu OCR runs only on Urdu-script pages, so digits aren't corrupted.
- Vendor-free `core/ingest.py`:
  - Dedupes on a hash of the source's stable id, and never re-downloads known items.
  - Adds unknown companies (e.g. `MCBIM-FUNDS`) from the announcement row.
  - If a PDF can't be read, it tries the image instead.
  - Failed items are retried on the next run.
- `seed_companies` job: 1,031 symbols from PSX. Blank names fall back to the symbol, and never overwrite a real name.
- `ingest` job with `--date` (one Pakistan-time day) and `--source`.
- CI installs Tesseract (with Urdu) so OCR tests run there too.
