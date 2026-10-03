# PSX Alerts

PSX company announcements and market-moving news, summarised in plain English and Urdu, published on a free website and pushed to a WhatsApp Channel, a Facebook Page and X.

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

More sections (database, sources, AI, publishing, automation, runbook) are added as each phase is built.
