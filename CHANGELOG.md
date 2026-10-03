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

## Phase 3 – AI processing (2026-10-04)

- OpenAI-compatible LLM adapter with a fallback chain from `LLM_CHAIN`: Gemini 3.6 Flash, then Gemini 3.5 Flash, then Groq gpt-oss-120b.
  - It backs off once on rate limits, then moves to the next model.
  - Every call is logged with tokens in a new `llm_calls` table (migration 004).
- Classification: title rules built from real PSX titles cover about 94% of items; leftovers go to the AI in one batched call. The category sets importance and summary method (template / dates / llm).
- Facts extraction: every number and date carries its source quote. Code verifies it against the document text, takes signs from the source, and drops what fails. Dividend Rs/share is computed only from a confirmed face value, which is learned from filings that state both % and Rs.
- Summaries in EN + UR, written from verified facts only (fixed sentences for routine items). The Urdu glossary is in `config/glossary_ur.yaml`.
- Quality gate: numbers check, context-aware banned advice/prediction phrases in both languages, length and sentence limits, Western digits only. One retry, then `needs_review`.
- Per-run AI budget (`--max-ai`). If all models are down, AI items wait for the next run and template items still go through.
- Versioned prompt files (`classify_v1`, `extract_v1`, `summarise_v1`), stored with every summary.
