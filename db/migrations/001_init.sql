-- 001_init: core tables (Part 2.4). Plain Postgres 15+, no vendor extensions.

create table companies (
  symbol text primary key,
  name text not null,
  sector text,
  face_value numeric default 10,
  aliases text[] default '{}',
  updated_at timestamptz default now()
);

create table sources (
  id text primary key,
  kind text not null,
  url text not null,
  enabled boolean default true,
  last_run_at timestamptz,
  last_error text
);

create table documents (
  id bigserial primary key,
  source_id text references sources(id),
  url text not null,
  content_hash text not null unique,
  title text not null,
  symbol text references companies(symbol),
  published_at timestamptz,
  first_seen_at timestamptz default now(),
  text text,
  used_ocr boolean default false,
  status text default 'new'                      -- new | processed | failed | skipped
);
create index on documents (status, first_seen_at);

create table items (
  id bigserial primary key,
  document_id bigint unique references documents(id),
  symbol text references companies(symbol),
  category text not null,
  importance smallint default 1,                 -- 3 = post-worthy
  facts jsonb default '{}',
  confidence numeric,
  review_status text default 'auto',             -- auto | needs_review | approved | hidden
  created_at timestamptz default now(),
  search tsvector
);
create index on items (symbol, created_at desc);
create index on items (category, created_at desc);
create index items_search_idx on items using gin (search);

create table summaries (
  id bigserial primary key,
  item_id bigint references items(id),
  lang text not null,                            -- en | ur
  headline text not null,
  body text not null,
  model text not null,
  prompt_version text not null,
  created_at timestamptz default now(),
  unique (item_id, lang, prompt_version)
);

create table posts (
  id bigserial primary key,
  kind text not null,                            -- alert | morning_brief | evening_digest
  item_id bigint references items(id),           -- null for briefs and digests
  platform text not null,                        -- facebook | x | whatsapp_queue
  text_en text not null,
  text_ur text not null,
  image_url text,
  link_url text,
  status text default 'queued',                  -- queued | ready | posted | failed | skipped
  scheduled_for timestamptz,
  posted_at timestamptz,
  external_id text,
  error text,
  -- NULLS NOT DISTINCT so a brief (item_id null) or an alert (scheduled_for null)
  -- cannot be queued twice; plain unique treats NULLs as different values.
  unique nulls not distinct (kind, item_id, platform, scheduled_for)
);
create index on posts (status, platform);
