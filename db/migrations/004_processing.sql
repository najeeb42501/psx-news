-- 004_processing: AI call log and confirmed face values.

-- One row per LLM call: which model, what for, tokens used. Used to stay inside
-- free-tier limits and shown on the admin health page later.
create table llm_calls (
  id bigserial primary key,
  created_at timestamptz default now(),
  provider text not null,
  model text not null,
  purpose text not null,                 -- classify | extract | summarise
  document_id bigint references documents(id),
  prompt_tokens int,
  completion_tokens int,
  ok boolean not null,
  error text
);
create index on llm_calls (created_at desc);
alter table llm_calls enable row level security;   -- no public access

-- Face value is only used to compute Rs/share when it is known for sure:
-- stated in a filing, or inferred from a filing that gives both % and Rs/share.
alter table companies add column face_value_confirmed boolean not null default false;
