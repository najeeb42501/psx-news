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

- OpenAI-compatible LLM adapter with two fallback chains, each model with its own free quota:
  - `LLM_CHAIN` writes summaries and needs good Urdu: Gemini 3.6/3.5 Flash, 3.1/3.5 Flash-Lite, then Groq gpt-oss-120b.
  - `LLM_EXTRACT_CHAIN` extracts facts: Gemini Lite models, then Groq gpt-oss-120b, Qwen and gpt-oss-20b.
  - Busy models get short back-offs. Overloaded (503) and daily-quota models are skipped. Every call is logged with tokens in `llm_calls` (migration 004).
- Classification: title rules built from real PSX titles cover about 94% of items; leftovers go to the AI in one batched call. The category sets importance and summary method:
  - `template`: fixed sentences from the title.
  - `dates`: the AI extracts dates, and code writes the sentences.
  - `llm`: the AI writes the summary from verified facts.
- Facts extraction: every number, date and key point must carry an exact quote from the document, and code verifies it:
  - The quote must be found (tolerant of OCR spacing) and must include the row label.
  - The sign comes from brackets or a minus on the number, or a pure "loss" label, never from "Profit/(loss)".
  - Previous-period column values are rejected.
  - A "closed period" is never treated as book closure.
  - Dividend Rs/share is computed only from a confirmed face value.
- Summaries in EN + UR, written from verified facts only. Urdu glossary in `config/glossary_ur.yaml`.
- Quality gate:
  - Numbers must come from the facts or the title (per-share amounts exact, large amounts may be shown in million/billion).
  - Context-aware banned advice/prediction phrases in both languages.
  - Length and sentence limits, and Western digits only.
  - No mixed English/Urdu words, and no "Rs" in Urdu.
  - One retry, then `needs_review`.
- Per-run AI budget (`--max-ai`). If AI is unavailable, items wait for the next run. After 24 h they get a title-based summary so the feed is never missing them.
- `--reprocess <categories>` re-runs items after a prompt change.
- Versioned prompts: `classify_v1`, `extract_v3`, `summarise_v3`. v1/v2 are kept because older summaries reference them.
- Fixed after a manual review of 34 real filings:
  - A "Profit/(loss)" label had flipped a profit into a loss (DIIL).
  - A bare number was guessed as revenue (SHCI).
  - An insider "closed period" had been reported as book closure (SPL, DAAG, MARI).
  - Per-share amounts had been rounded.
  - Urdu gender agreement in the fixed sentences.
- Dates by rules first (`core/date_rules.py`): meeting date/time, book closure range and period are read from the fixed wording of PSX notices.
  - The rules cover 45 of 55 real notices with 0 disagreements against the AI, and need no AI call.
  - The AI is used only when the rules find nothing.
- Groq pacing: waits up to 65 s for its per-minute token limit. Qwen and gpt-oss-20b were dropped from the default extraction chain (output limits, broken JSON).
- Meeting times are kept only with a verified date and when found in the source. "Other figures" also need a row label and the current-period column.
- Quality gate: digits inside names (KSE-100, G7, Q1, FY26) are not treated as amounts. Numbers inside verified key-point quotes are allowed. Urdu punctuation after an English word is fine.
- Acceptance on real PSX filings of 2026-10-02:
  - 34 results / dividend / board-meeting / rights / material-information / book-closure filings, 27 of them scanned. All 34 are published, with 0 failing the number check.
  - Across all 156 documents: 155 published, 1 in review.
- Urdu style, from the reviewer's feedback: modern Urdu with English financial terms in Urdu script (ڈیویڈنڈ، آفٹر ٹیکس پرافٹ، ریونیو، بورڈ میٹنگ، بک کلوژر). Short codes stay in English letters (EPS, AGM, PSX, SECP), EPS is "فی شیئر آمدن", and company names stay in English. Changes: glossary rewritten, `summarise_v4` (which also enforces "21 Oct 2026" dates and no filler sentences), and `template_v2` fixed sentences. All 156 items were regenerated.

## Phase 4 – Website (2026-10-04)

- Pages:
  - The feed, with company / sector / type / date filters and pagination. "My stocks" appears first.
  - The item page: full EN/UR summary, key numbers table from verified facts, original source link, publish time in PKT, and share buttons.
  - The company page: announcements, latest results, dividend history and upcoming events.
  - Today's 10 things, Upcoming events (next 45 days), Search, My stocks and About.
- English / اردو / Both toggle, applied before first paint. Noto Nastaliq Urdu, right to left. Interface labels stay English in "both" mode.
- Share card PNG (`/api/og/item/[id]`) rendered with resvg, which shapes Nastaliq correctly (`next/og` fails on its font). It is also used as the link preview image.
- Admin (`/admin`, `ADMIN_TOKEN`):
  - Review queue: approve / edit / hide, find by symbol, show again. Edits are checked for advice wording, Urdu digits and headline length.
  - WhatsApp queue: copy EN/UR text, download the image, mark as posted.
- Migration `005`: `web_items.sort_time`, the `web_events` view and the `web_search()` function, all read-only for the public key.
- Speed on a simulated mid-range phone over slow 4G (1.6 Mbps): content visible in 0.4–1.1 s. The first-ever visit fully loads in 3.2 s; later pages in about 0.6 s.

### Phase 4 – UI/UX upgrade (2026-10-04)

- New layout: a wide two-column desktop view with a side panel, an app-style bottom bar on phones, and header search with instant company suggestions.
- The feed is grouped by day, and card size follows importance: results, dividends and policy news get big cards with key-number chips (profit/loss, EPS, dividend), while routine filings are one-line rows.
- Features:
  - Highlights strip; quick type chips, "Important only" and "More filters".
  - New `/results` results tracker (sortable, sector filter, blanks where a figure was not verified).
  - Calendar grouped by date with type filters.
  - My stocks dashboard with events and "new since last visit".
  - Related items on item pages and a stats header on company pages.
  - Installable app (manifest + icons).
- Full Urdu interface in Urdu mode: interface labels translated and the whole page mirrored right-to-left.
- Accuracy crawl of the production build:
  - All 156 item pages: 200 for published items, 404 for unpublished ones. Displayed EPS and dividends match the database, and the bilingual disclaimer is on every page.
  - All 156 share cards and 104 company pages render.
  - The feed shows exactly the 145 published items and never hidden ones, and the results tracker lists all 17 companies.

### Manual job runs and health page (2026-10-04)

- Scheduled jobs are postponed until the pipeline is verified, by decision. Jobs run only when started by hand.
- `pipeline.jobs.run` runs ingest / process / both as one recorded run (`job_runs`, migration 006), with its log and summary, and refuses to start while another run is in progress.
- Admin **Jobs & health** page:
  - Run buttons, with options for a specific day, one source and the AI budget.
  - Live-updating run history with per-source counts and logs.
  - Capture check: the PSX portal's own total (now recorded on every fetch) vs documents stored, per source.
  - Source status and errors, work waiting, and AI use today per model (`admin_health()`, migration 007, admin-only).
