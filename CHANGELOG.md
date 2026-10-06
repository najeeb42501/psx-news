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

### Review-queue fixes and smarter summaries (2026-10-04)

From the first 3 items held for review:
- **Invented exact dates.** The source said "by Dec 2027" and the model wrote "31 December 2027", because the prompt asked for every date as "21 Oct 2026". New `summarise_v5` prompt: it is written as an editor's brief (decide what matters, keep the source's precision, check every number before answering). Month-only dates stay month-only, and short codes (IMF, FBR, NEPRA…) stay in English letters in Urdu.
- **"170k" read as 170.** The number check now understands k / m / mn / bn / tr / crore / lakh in the source, so "170k" written as "170,000" passes. Other numbers are still caught.
- **News sent to the company template.** A news story with no checkable figures used "The company has made an announcement on PSX". It now uses the news template (headline + link) and is published, because it contains no numbers. A company filing in this situation still goes to review.
- **Clearer retries.** Problems now quote the sentence they were found in, and the retry is told how to fix them. A summary gets up to 2 retries (was 1) before going to review. This is also visible to the reviewer in `review_notes`.
- **No needless ".0".** "Rs 325.0 million" becomes "Rs 325 million" before the check. The 20 published summaries that had this were tidied in place, with the same values.
- Reprocessed the 3 items with the new code: all 3 now pass and are published automatically.

Admin:
- **Source failure alert.** When a source fails 3 runs in a row, a red banner shows on every admin page, with the last error. It clears after the source's next successful run.


## v1.1 Phase 1 – Audit (2026-10-04)

- Audit of every area in the v1.1 checklist against the real code, data and a local production build: 1 OK, 12 needs work, 4 missing. Report with evidence, screenshots and a ranked fix list (shared as a private page). No code changed.

## v1.1 Phase 2 – Correctness and reliability (2026-10-05, branch `v1.1-phase2`)

Completeness:
- **No more skipped items after a failed run.** Runs used to start from the last run, even a failed one. They now start from `sources.last_success_at` ("complete up to"), which only moves when everything was stored; a failed download moves it back so the item is retried (up to 2 days). Migration 008.
- **Late listings:** the first run of each Pakistan day re-lists all of yesterday.
- **Layout changes fail loudly:** if the PSX portal lists announcements but none can be read, the source fails with `PsxLayoutError` (before: "0 new", silently).
- **Scanned tables:** pages that are mostly a picture with only a header and footer as text are now OCR'd (before: only pages with under 40 characters).
- Backfilling the 4 missed days (28 Sep – 1 Oct) was postponed by decision.

Accuracy and style:
- **REDCO corrected:** revenue Rs 1.8 billion, profit Rs 5.6 million (the earlier manual text had 1,795.9 and 5.5).
- **Admin edits are number-checked:** every number must be in the original filing, or the editor ticks "I checked these numbers". The page then says which numbers changed. Urdu style rules apply to edits too.
- **Long filings:** the model gets the cover letter plus the passages around the key rows instead of the first 8,000 characters (10 of 17 results filings were longer).
- **PSX titles as a source:** facts may be quoted from the portal title. LSEFSL's rights issue now shows 58.89% at Rs 1 per share.
- **Results without profit or EPS go to review** (SUTM).
- **Modaraba "Annual Review Meeting"** is no longer called an AGM.
- **News attribution:** prompt `summarise_v6` and a new check: forecasts and claims in news summaries must say whose they are, in both languages ("ProPakistani reports…", "…: Dawn"). Off-topic stories keep the outlet's name in the headline.
- **Urdu checks:** "نل" (a water tap) for nil, codes like IMF in Urdu letters, and masculine بک کلوژر are now caught; the prompt asks for کوئی … نہیں and ہوگی. Reviewer's choice: بک کلوژر is feminine.
- **Foreign-market news** ("US stocks") is kept out of the feed; classifier prompt `classify_v2`.
- **Duplicate news:** the same story from a second outlet within 36 hours is merged (no AI call) and shown as "Also reported by". The Karachi Port story pair was merged.
- 58 published summaries were rewritten from their stored facts with `summarise_v6` (new `resummarise` job; no re-extraction).

Website:
- **Urdu reading order fixed:** Urdu text used `unicode-bidi: plaintext`, so a summary starting with "DIIL" was laid out left-to-right. Urdu blocks are now always right-to-left, with English names and numbers isolated (`components/urdu-text.tsx`).
- Urdu mode shows figures in Urdu ("34.3 ملین روپے") in badges and fact tables.

Admin and security:
- **Admin sign-in by emailed magic link** (Supabase Auth) for emails in `admin_users`, with a signed session cookie (`ADMIN_SESSION_SECRET`). Emergency password sign-in only while `ADMIN_ALLOW_PASSWORD=1`.
- **Sign-in throttle:** 5 failures from one address in 15 minutes locks it out for the rest of the window (`admin_login_attempts`).
- **Security headers** (CSP, frame protection, nosniff, referrer policy, HSTS in production), `X-Powered-By` removed, **rate limit** of 60 requests/minute per address on `/api/*`.
- **Bulk approve** in the review queue.
- **Health page:** delays over 7 days (published → stored → on site), "complete up to" per source, time per source and AI time per run. Migration 009 (`admin_health()` v2).
- **Nightly encrypted backup** (`.github/workflows/backup.yml`), kept 14 days, with a restore test on every run.

Acceptance (re-run of the Phase 1 measurements):
- Duplicates: 0 repeated documents or items; 1 cross-outlet story merged.
- Numbers: all 183 published items checked by script against their source text: 0 numbers not found. New 50-item sample (none from the first sample) read in English and Urdu: 0 wrong numbers.
- Style and compliance checks on all published items: 0 problems.
- Capture: 100% on fetched days. The 4 unfetched days stay missing until a backfill is approved.
- Tests: 178 Python tests (23 new), web lint and types clean, 16 browser checks of sign-in, edits, throttle, Urdu, headers and rate limit.

Rollback: `git switch main` (code). Migrations 008 and 009 only add a column, two tables and a new version of `admin_health()`, so main keeps working with them in place. Summaries rewritten in this phase are new rows; older versions are kept in `summaries`.

## v1.1 Redesign – Step 1: design system (2026-10-05, branch `v1.1-redesign`)

From the "ShareKhabar Premium UI Redesign" brief. Built on the Phase 2 branch.
- **Tokens** in `web/app/globals.css` (Tailwind v4 theme): neutral palette, hairlines, one brand colour, green/red only for numbers; light and dark (follows the device, or the new theme toggle). Four colours from the brief were adjusted to pass WCAG AA on every surface: fg-secondary #5E5E63, fg-tertiary #6E6E73 (light), fg-tertiary #98989D and negative #FF6961 (dark).
- **Type:** Inter (variable) for English and numbers, tabular figures; Noto Nastaliq Urdu at 17/34, never below 15px. Scale: display, headline, title, body, caption, eyebrow.
- **Components** in `web/components/ui/`: one-row sticky header with text navigation, search (command palette: Ctrl/Cmd+K or "/"), language segmented control and theme toggle; phone tab bar; news row; featured card; symbol badge; meta line; key-figure pill and stat tile; section header; filter bar with a filters sheet; sortable data table that becomes a list on phones, with "—" for values a filing doesn't state; empty states with suggestions; skeletons; snackbar; footer with the bilingual disclaimer aligned in one column. Icons: Lucide, outline, 20px, 1.5 stroke.
- **One date style:** "2 Oct" in lists, "Friday 2 October 2026, 3:45 pm" on item pages, "Today / Yesterday / Sat 3 Oct" day headers.
- **/design** (admin only): every component and state with real items, for approval before the pages are rebuilt.
- The Next.js development badge is turned off.

## v1.1 Redesign – Step 2: Home and item page (2026-10-06, branch `v1.1-redesign`)

Following the updated brief (visual add-on and new home page).
- **New site chrome everywhere:** one-row header, phone tab bar, new footer, one 1200px container.
- **Cover images** (`components/ui/cover.tsx`), drawn as inline SVG from our own data: data cards for filings (symbol, the main figure, mini profit chart when 2+ periods exist), our own abstract topic artwork for news (21 topics), monogram fallback. Muted category colours, light and dark, all ≥ 4.5:1. No photos, logos or AI images.
- **Home** rebuilt as a front page: hero (compact one-line greeting for returning visitors, switched before paint), today at a glance, your stocks, top stories, results carousel, latest updates (filings / economy tabs), this week day strip, sectors, what you can do, how it works, stay updated. Weekends say "Weekend recap" and "Week ahead". Sections without data are hidden; "Learn the basics" waits for the Learn articles.
- **Item page** rebuilt as an article: headline, date and source once, subheading, cover, key-figure tiles, what happened, what's next (dates from the filing), original filing button, share bar, related stories.
- **New pages:** `/latest` (the filterable feed moved off Home) and `/sector/[slug]` (10 sectors).
- Meeting times normalised ("3:00 pm"); PSX open/closed from regular trading hours (public holidays not known yet).
- Lighthouse mobile: Home 82 / item 84 performance, accessibility 98 / 100, layout shift 0. Load time (LCP ~4 s) is the performance phase's job.

## v1.1 Redesign – Today, Calendar and Results (2026-10-07, branch `v1.1-redesign`)

- **Language:** the "Both" mode is removed. The switch is now English | اردو only.
- **Today** rebuilt as a numbered list of the 10 most important items. It always uses the last trading day, so a weekend never shows an empty page. Each item has a cover, a short summary and the key figure. A side panel shows the day in numbers and the next six events, and a link opens all of that day's updates.
- **Calendar** (`/calendar`, replacing `/upcoming`, which now redirects there):
  - tabs by event type with counts, and an All companies / My stocks switch;
  - events grouped under day headings ("Today", "Tomorrow"), in time order within each day, with book closures first;
  - a month calendar whose marked days jump to that day's events.
- **Results:**
  - one row per company: period, revenue, profit after tax, EPS, cash dividend and announcement date;
  - search, sector and period filters, plus counts of companies, profits, losses and dividends;
  - losses shown in red with a minus sign;
  - the "vs last year" column appears only once a filing states both years.
- **Times:**
  - a meeting time stated without am/pm is read as office hours (8–11 am, 12–7 pm);
  - times and English company names keep their direction on Urdu pages.
