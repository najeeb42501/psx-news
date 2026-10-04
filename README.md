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
- If PSX changes this scheme, the source fails with `PsxBlockedError`.

**Politeness.** Every request identifies us (`ShareKhabarBot/0.1 (+mailto:…)`). Requests are spaced at least 1 s apart, with back-off and retries on errors. Items already stored are never downloaded again.

**Text extraction.**
- Most PSX PDFs are scans, so OCR is the normal path.
- pdfplumber reads the text layer, and Tesseract OCRs pages that have none. It also reads the notice image (`/download/image/<id>-1.gif`), which is the only file for some announcements, such as "Board Meeting In Progress".
- Each page's script is detected first: English pages use `eng`, Urdu pages `urd+eng`. Running Urdu on English pages turns some digits into Urdu ones.
- Limits keep the free database small: 15 pages, 6 OCR'd pages and 40,000 characters per document.

**Tesseract install.**
- Windows: the UB Mannheim installer, with **Urdu** ticked under "Additional language data". It is found automatically in `C:\Program Files\Tesseract-OCR`, or set `TESSERACT_CMD`.
- Ubuntu: `apt-get install tesseract-ocr tesseract-ocr-urd`.

**Idempotency.** Each document is keyed by a hash of its stable source id: the PSX announcement id, or the RSS guid. Re-running stores nothing twice. An item whose download fails is not stored, so the next run retries it. If a PDF can't be read, the notice image is tried instead.

## AI processing

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

   A failing summary gets one retry with the problems listed. If it still fails, it is stored as `needs_review`: not shown and not posted.

**Models** are set in `.env` and tried in order (defaults are in `pipeline/config/settings.py`):
- `LLM_CHAIN` writes the summaries, which need good Urdu (Gemini Flash models first).
- `LLM_EXTRACT_CHAIN` does fact extraction, which is English and verified by code, so smaller models are fine.

Each model has its own free quota. A model that hits its daily quota is skipped for the rest of the run.
- All go through one OpenAI-compatible client. To switch models or providers, change `LLM_CHAIN`.
- Every call is logged in `llm_calls` with its token counts.
- Each summary stores the model and prompt version.
- **Prompts** are versioned files in `pipeline/config/prompts/`. To change one, add e.g. `summarise_v4.md` and update `PROMPT_VERSIONS` in `container.py`.

More sections (publishing, automation, runbook) are added as each phase is built.
