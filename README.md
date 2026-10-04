# ShareKhabar (شیئر خبر)

ShareKhabar turns PSX company announcements and market-moving news into short summaries in plain English and Urdu, published on a free website and pushed to a WhatsApp Channel, a Facebook Page and X.

> Information only, not investment advice. We do not recommend buying or selling any security.

## Repository layout

```
pipeline/            Python 3.12 jobs (run by GitHub Actions)
  core/              vendor-free logic: models, interfaces, classify, extract, summarise, quality, compose
  adapters/          one adapter per vendor: sources/, parsers/, llm/, repo/, publishers/
  jobs/              ingest.py, process.py, compose.py, publish.py
  config/            settings.py, sources.yaml, glossary_ur.yaml, prompts/
  container.py       picks adapters from settings
  tests/
web/                 Next.js website + admin (all DB reads in lib/data.ts)
db/migrations/       plain numbered SQL migrations
.github/workflows/   CI and scheduled jobs
```

The core talks only to interfaces in `pipeline/core/interfaces.py`, so you can swap any vendor by changing env vars or adding one adapter.

## Setup (local)

You need **Git**, **uv** and **Node.js 20+**. uv installs Python 3.12 for you.

```bash
# Python pipeline
uv sync                                  # installs Python 3.12 + dependencies into .venv
uv run pytest                            # run tests
uv run python -m pipeline.jobs.ingest    # run a job

# Website
cd web
npm install
npm run dev                              # http://localhost:3000
npm run build
```

Copy `.env.example` to `.env` and fill in the values as each phase asks for them. Never commit `.env`.

## Database

Any Postgres 15+ works. The MVP uses Supabase's free plan (Mumbai region).

1. Create a Supabase project. Then click **Connect** → **Direct** → change the method to **Session pooler** and copy the URI. The session pooler works over IPv4, which GitHub Actions needs.
2. Put it in `.env` as `DATABASE_URL=`. Use the real password without `[ ]`, and percent-encode special characters (`#` → `%23`, `/` → `%2F`, `@` → `%40`).
3. Apply migrations: `uv run python -m pipeline.jobs.migrate`. It is safe to re-run: each file in `db/migrations/` is applied once, in order.

**Who can read what**
- The pipeline connects as the table owner.
- The website's public (publishable) key can only `select` from the `web_items` and `web_companies` views. These show items with `review_status` `auto` or `approved`, with their latest EN/UR summaries and source link.
- Posts, sources, full document text and hidden or needs-review items are not readable with that key. Row-level security is on for every table.
- The admin area uses the server-side secret key.
- **Any new table must `enable row level security`.**

**Tests.** `uv run pytest` runs the repository tests against an in-memory fake and, when `DATABASE_URL` is set, against the real database. Each DB test runs in a transaction that is rolled back, so it leaves no data behind.

To switch database hosts, point `DATABASE_URL` at the new Postgres and run `migrate`.

## Ingestion

```bash
uv run python -m pipeline.jobs.seed_companies             # load/refresh companies from PSX's symbol list
uv run python -m pipeline.jobs.ingest                     # normal run: everything since each source's last run
uv run python -m pipeline.jobs.ingest --date 2026-10-02   # one Pakistan-time day (backfill / checking)
uv run python -m pipeline.jobs.ingest --source psx_companies
```

**Sources** are listed in [pipeline/config/sources.yaml](pipeline/config/sources.yaml): PSX company announcements, PSX notices, SECP notices and four RSS feeds.
- To add a feed, add an entry there.
- A new kind of source needs one adapter in `pipeline/adapters/sources/` and one line in `SOURCE_FACTORIES` in `pipeline/container.py`.

**How the PSX portal works** (details in `pipeline/adapters/sources/psx.py`):
- Every page embeds a request token. Data requests (`POST /announcements`, `GET /symbols`) must send it back as `X-Req-Id`, so the scraper loads the page first, like a browser does.
- At most 100 rows come back per request; a market day has about 125 company announcements.
- If PSX changes this scheme, the source fails with `PsxBlockedError`. If the portal lists announcements but none can be read (a page redesign), it fails with `PsxLayoutError` instead of reporting "nothing new".

**Politeness.** Every request identifies us (`ShareKhabarBot/0.1 (+mailto:…)`). Requests are spaced at least 1 s apart, with back-off and retries on errors. Items already stored are never downloaded again.

**Text extraction.**
- Most PSX PDFs are scans, so OCR is the normal path.
- pdfplumber reads the text layer, and Tesseract OCRs pages that have none. It also reads the notice image (`/download/image/<id>-1.gif`), which is the only file for some announcements, such as "Board Meeting In Progress".
- Each page's script is detected first: English pages use `eng`, Urdu pages `urd+eng`. Running Urdu on English pages turns some digits into Urdu ones.
- Limits keep the free database small: 15 pages, 6 OCR'd pages and 40,000 characters per document.

**Tesseract install.**
- Windows: the UB Mannheim installer, with **Urdu** ticked under "Additional language data". It is found automatically in `C:\Program Files\Tesseract-OCR`, or set `TESSERACT_CMD`.
- Ubuntu: `apt-get install tesseract-ocr tesseract-ocr-urd`.

**Idempotency.** Each document is keyed by a hash of its stable source id: the PSX announcement id, or the RSS guid. Re-running stores nothing twice. If a PDF can't be read, the notice image is tried instead.

**Nothing is skipped** (`sources.last_success_at`, the "complete up to" time on the Jobs page):
- A normal run starts just before the point up to which everything has been stored, not from the last run. A run that failed (PSX down) therefore doesn't move the start forward.
- An item whose download fails moves that point back to just before it, so the next run retries it (for up to 2 days).
- The first run of each Pakistan day also re-lists all of yesterday, to catch filings the portal lists late.
- A one-day backfill (`--date`) never moves the point.

**Pages that are mostly a picture** (a scanned table with only a header and footer as text) are OCR'd too.

## AI processing

**v1.1 additions** (details in CHANGELOG):
- **Long filings:** the model reads the cover letter plus the passages around the key rows (profit, EPS, revenue, dividend, book closure), not just the first 8,000 characters. Quotes are still checked against the full text.
- **PSX titles count as a source:** facts may be quoted from the portal's title ("58.89% Right Issue Rs.1/- Per Share") when the PDF is a scanned table.
- **News is attributed:** a forecast or claim in a news summary must say whose it is ("ProPakistani reports…", "…: Dawn"), in both languages, or the summary goes to review.
- **Urdu checks:** no "نل" for nil, short codes (IMF, FBR) in English letters, and بک کلوژر is feminine (ہوگی).
- **Duplicates:** the same news story from a second outlet within 36 hours is stored as a duplicate (never shown, no AI call) and listed on the first story as "Also reported by".
- **Results without profit or EPS** go to review.
- **Rewriting summaries** after a prompt change, from the stored, already verified facts (no new extraction): `uv run python -m pipeline.jobs.run --job resummarise --items 178 181`. Hidden items are left alone.

```bash
uv run python -m pipeline.jobs.process              # classify, extract, summarise and check all new documents
uv run python -m pipeline.jobs.process --max-ai 40  # allow more AI documents in this run (default 25)
```

**The steps** (all in vendor-free `pipeline/core/`):
1. **Classify** (`classify.py`): title rules first; leftovers go to the AI in one batched call. The category sets the importance (0 = kept out of the main feed, 3 = post-worthy) and how the summary is written:
   - `template`: fixed EN/UR sentences from the title, for routine items (no AI).
   - `dates`: dates are read by rules first (`date_rules.py`), with the AI only when the wording is unusual. Code then writes the summary (board meetings, AGMs, book closures, briefings).
   - `llm`: the AI extracts facts, then writes the summary from the verified facts (results, dividends, bonus/right shares, material information, market news).
2. **Extract** (`extract.py`, `facts.py`): the AI returns facts JSON in which every number and date carries the exact quote it came from. Code then checks each one:
   - The quote must be found in the document (tolerant of OCR spacing).
   - The number must be inside its quote.
   - The quote must include the row label, and must not be from the previous-period column.
   - The sign comes from the source: brackets or a minus on the number, or a pure "loss" label (not "Profit/(loss)").
   - Key points need a quote too, and an insider "closed period" is never book closure.
   - Anything that fails is dropped. Dividend Rs/share is computed only when the face value is confirmed by a filing, never assumed.
3. **Summarise** (`summarise.py`): EN + UR summaries, written only from the verified facts. Urdu is written directly using [glossary_ur.yaml](pipeline/config/glossary_ur.yaml).
4. **Quality gate** (`quality.py`), on both languages:
   - Every number must come from the facts or the title.
   - No advice or prediction wording.
   - Headline ≤ 90 characters, body ≤ 3 sentences, and Western digits only.

   - Numbers written with a scale in the source ("170k", "Rs1.5bn") may be written in full ("170,000", "Rs 1,500 million").

   Before the check, a needless ".0" is removed ("Rs 325.0 million" → "Rs 325 million"). A failing summary gets up to 2 retries, each told what was wrong and in which sentence. If it still fails, it is stored as `needs_review`: not shown and not posted.
   A news story with no checkable facts is published as its headline plus the link. A company filing with no checkable facts goes to review.

**Models** are set in `.env` and tried in order (defaults are in `pipeline/config/settings.py`):
- `LLM_CHAIN` writes the summaries, which need good Urdu (Gemini Flash models first).
- `LLM_EXTRACT_CHAIN` does fact extraction, which is English and verified by code, so smaller models are fine.

Each model has its own free quota. A model that hits its daily quota is skipped for the rest of the run.
- All go through one OpenAI-compatible client. To switch models or providers, change `LLM_CHAIN`.
- Every call is logged in `llm_calls` with its token counts.
- Each summary stores the model and prompt version.
- **Prompts** are versioned files in `pipeline/config/prompts/`. To change one, add e.g. `summarise_v6.md` and update `PROMPT_VERSIONS` in `container.py`.

## Website (`web/`)

Next.js 16 (App Router, TypeScript, Tailwind), mobile-first, English / Urdu / both.

```bash
cd web
npm install
npm run dev      # http://localhost:3000   (needs web/.env.local, see below)
npm run build
```

**Settings.** Put these in `web/.env.local` for local runs; on Vercel they go under Project → Settings → Environment Variables:

| Name | What |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public key: the site reads only the read-only `web_*` views with it |
| `SUPABASE_SECRET_KEY` | Server-side only: used by the admin area |
| `ADMIN_TOKEN` | Password for `/admin` |
| `SITE_URL` | Public address, e.g. `https://sharekhabar.vercel.app` (used in share links) |
| `NEXT_PUBLIC_WHATSAPP_CHANNEL_URL`, `NEXT_PUBLIC_FACEBOOK_PAGE_URL` | Optional, from Phase 5: show the Follow buttons |

**Pages.**
- `/` (feed):
  - Highlights strip and "My stocks" first.
  - Type chips, an "Important only" switch and more filters (symbol, sector, date).
  - Grouped by day; card size follows importance (highlight / normal / one-line).
  - On desktop, a side panel shows this week's events.
- `/item/[id]`: key-number chips, full summary, key numbers table, original source, share buttons, and more from the same company.
- `/company/[symbol]`: stats, announcements, upcoming events, latest results and dividend history.
- `/results`: results tracker. Each company's latest results (revenue, profit, EPS, dividend) from verified facts, sortable and filterable.
- `/today`: Today's 10 things.
- `/upcoming`: calendar grouped by date, filterable by board meetings / AGMs / book closures / briefings.
- `/my-stocks`: a dashboard of news and events for followed companies, with "new since last visit" badges. Saved in the browser.
- `/search` and the header search (instant company suggestions), and `/about`.
- **Installable (PWA):** `app/manifest.ts` and the app icons enable "Add to home screen".

**Design.**
- Mobile-first, with a bottom app bar on phones and top tabs plus a side panel on desktop.
- Each type has its own colour and icon (`lib/categories.ts`), and dark mode follows the system.
- In Urdu mode the whole layout mirrors right-to-left (`dir="rtl"`; spacing uses start/end classes).

**Data.**
- All database reads are in `web/lib/data.ts`, via the Supabase REST API with the publishable key, cached for 60 s.
- Migration `005` adds `web_events` and `web_search()`.

**Language.**
- `<html data-lang="en|ur|both">` is set before first paint from `localStorage`.
- Content uses `.en-only` / `.ur-only`, and interface labels use `.ui-en` / `.ui-ur` (English in "both" mode).
- Urdu uses Noto Nastaliq Urdu, right to left.

**Share images.**
- `/api/og/item/[id]` renders a 1200×630 PNG card: headline, key number, Urdu line, source, date and disclaimer.
- It uses **resvg**, because `next/og` cannot shape Nastaliq. `lib/card.ts` places mixed English/Urdu runs right to left itself.
- Fonts are in `web/assets/fonts`.

**Admin sign-in** (v1.1):
- Admins sign in with a one-time link emailed by Supabase Auth. Only emails in the `admin_users` table get a link or a session:
  `uv run python -m pipeline.jobs.admins add you@example.com` (also `list`, `remove`).
- The session is a cookie signed with `ADMIN_SESSION_SECRET` (in `web/.env.local`), valid 7 days. Removing an email from `admin_users` ends that person's access at once.
- After 5 failed sign-ins from one address in 15 minutes, sign-in is refused for that address until the window passes.
- Emergency password sign-in (email + `ADMIN_TOKEN`) works only while `ADMIN_ALLOW_PASSWORD=1` is set; remove that line once email sign-in works.
- Supabase settings needed once: Authentication → URL Configuration → add `<SITE_URL>/admin/auth/callback` to Redirect URLs.

**Admin** (`/admin`):
- **Jobs & health** (`/admin/jobs`):
  - **Running jobs:** buttons start the pipeline on this computer (needs `JOB_RUNNER=local` in `web/.env.local`): fetch new items, summarise new items, or both, optionally for one day or one source. Nothing runs on a schedule yet. The same runs work from the command line: `uv run python -m pipeline.jobs.run --job pipeline`.
  - **Recorded runs:** every run is stored in `job_runs` with its counts and log, and only one runs at a time.
  - **Health:** the PSX portal total vs stored (capture %), source status and errors with the "complete up to" time, waiting work, today's AI use per model, and delays over the last 7 days (published → stored → on site). Each run shows time per source and AI time.
  - **Alerts:** a source that fails 3 runs in a row shows a red banner on every admin page until it works again.
- **Review queue:** approve (one by one or several at once), edit, or hide items. Find any published item by symbol. Hidden items can be shown again.
  - Edits get the same checks as AI summaries: advice wording, Urdu style, and **every number must be in the original filing**. A number that isn't (e.g. the OCR garbled the source) needs the "I checked these numbers" tick. After saving, the page says which numbers changed.
- **WhatsApp queue:** copy the EN/UR text, download the image, and mark as posted.

**Security** (v1.1):
- Every response carries a Content Security Policy (nothing loads from other sites), `X-Frame-Options: DENY`, `nosniff`, a referrer policy and (in production) HSTS. `X-Powered-By` is off.
- The public API (`/api/*`) allows 60 requests per minute per address (`proxy.ts`).
- Row-level security is on for every table. The public key reads only published items through read-only views; admin tables (`admin_users`, `admin_login_attempts`, `job_runs`, `llm_calls`) are server-only. Tests in `pipeline/tests/test_web_access.py` check this.

## Backups

`.github/workflows/backup.yml` runs every night at 02:30 Pakistan time (and on demand from the Actions tab). It never contacts PSX.
1. Dumps our tables (schema `public`) from Supabase.
2. Restores the dump into a throwaway Postgres and counts rows, so every backup is proven restorable.
3. Encrypts it (AES-256, passphrase `BACKUP_PASSPHRASE`) and keeps it as a workflow artifact for 14 days. Only the encrypted file is uploaded, because artifacts of a public repository can be downloaded by anyone signed in to GitHub.

Needs two repository secrets: `DATABASE_URL` and `BACKUP_PASSPHRASE` (both lines are in your `.env`). Keep a copy of the passphrase somewhere safe: without it a backup can't be opened.

**Restore** (needs Postgres 17 client tools):
```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in sharekhabar-db-YYYY-MM-DD.dump.enc -out db.dump -pass env:BACKUP_PASSPHRASE
pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$DATABASE_URL" db.dump
```

GitHub pauses scheduled workflows in a repository with no activity for 60 days; a push or a manual run starts them again.

More sections (publishing, automation, runbook) are added as each phase is built.
