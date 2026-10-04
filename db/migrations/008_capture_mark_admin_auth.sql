-- 008: completeness and admin sign-in (v1.1 phase 2).
--
-- sources.last_success_at: everything a source published before this time is stored.
-- The next normal run starts here (minus an overlap), so a failed run or a failed
-- download is retried instead of skipped. Before, runs started from last_run_at,
-- which also moved forward when a run failed.
alter table sources add column last_success_at timestamptz;
update sources set last_success_at = last_run_at where last_error is null;

-- Admins sign in with an emailed magic link (Supabase Auth). Only emails listed here
-- get a link or a session; the role column leaves room for an editor role later.
create table admin_users (
  email text primary key check (email = lower(email)),
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);
alter table admin_users enable row level security;  -- no policies: server (secret key) only

-- Sign-in attempts, to slow down guessing: after 5 failures from one address in
-- 15 minutes, sign-in is refused for that address until the window passes.
create table admin_login_attempts (
  id bigserial primary key,
  ip text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on admin_login_attempts (ip, at desc);
alter table admin_login_attempts enable row level security;  -- no policies: server only
