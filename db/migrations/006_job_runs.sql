-- 006_job_runs: a record of every pipeline run (started from admin, the command line,
-- or later a schedule), with its counts and log, for the admin Jobs & health page.
create table job_runs (
  id bigserial primary key,
  job text not null,                       -- ingest | process | pipeline
  params jsonb not null default '{}',      -- e.g. {"date": "2026-10-02", "source": "psx_companies"}
  triggered_by text not null default 'cli',-- admin | cli | schedule
  status text not null default 'running',  -- running | success | failed
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}',     -- counts per source, processing stats, portal totals
  log text
);
create index on job_runs (started_at desc);
alter table job_runs enable row level security;   -- admin only (server-side key)
