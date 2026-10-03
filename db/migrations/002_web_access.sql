-- 002_web_access: read-only views for the website, plus row-level security.
--
-- Model:
--   * Every table has RLS on. The pipeline connects as the table owner and the
--     admin uses the server-side secret key, so both bypass RLS.
--   * The public website (Supabase "anon" role, publishable key) can read only
--     through the web_* views. The views run with the caller's rights
--     (security_invoker), so the RLS policies below decide which rows it sees:
--     items in review_status auto/approved, and their summaries and documents.
--   * anon never sees sources, posts, full document text or hidden items.
--
-- The role-specific part runs only where the role exists (e.g. Supabase), so
-- this file also applies cleanly on a plain Postgres host.

create view web_items with (security_invoker = true) as
select
  i.id,
  i.symbol,
  c.name        as company_name,
  c.sector,
  i.category,
  i.importance,
  i.facts,
  i.created_at,
  d.url         as source_url,
  d.title       as source_title,
  d.source_id,
  d.published_at,
  en.headline   as headline_en,
  en.body       as body_en,
  ur.headline   as headline_ur,
  ur.body       as body_ur
from items i
join documents d on d.id = i.document_id
left join companies c on c.symbol = i.symbol
left join lateral (
  select s.headline, s.body from summaries s
  where s.item_id = i.id and s.lang = 'en'
  order by s.created_at desc, s.id desc limit 1
) en on true
left join lateral (
  select s.headline, s.body from summaries s
  where s.item_id = i.id and s.lang = 'ur'
  order by s.created_at desc, s.id desc limit 1
) ur on true
where i.review_status in ('auto', 'approved');

create view web_companies with (security_invoker = true) as
select symbol, name, sector, face_value, aliases from companies;

alter table companies enable row level security;
alter table sources   enable row level security;
alter table documents enable row level security;
alter table items     enable row level security;
alter table summaries enable row level security;
alter table posts     enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- Start from nothing: Supabase grants everything to anon/authenticated by default.
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated';

    -- The views are the only public read surface.
    execute 'grant select on web_items, web_companies to anon, authenticated';

    -- security_invoker views need column rights on the underlying tables.
    -- Documents: no full text; sources and posts: nothing.
    execute 'grant select on companies to anon, authenticated';
    execute 'grant select (id, symbol, category, importance, facts, created_at, document_id, review_status) on items to anon, authenticated';
    execute 'grant select (id, item_id, lang, headline, body, created_at) on summaries to anon, authenticated';
    execute 'grant select (id, url, title, source_id, published_at) on documents to anon, authenticated';

    execute $p$create policy web_read_companies on companies for select to anon, authenticated using (true)$p$;
    execute $p$create policy web_read_items on items for select to anon, authenticated
              using (review_status in ('auto', 'approved'))$p$;
    execute $p$create policy web_read_summaries on summaries for select to anon, authenticated
              using (exists (select 1 from items i where i.id = summaries.item_id
                             and i.review_status in ('auto', 'approved')))$p$;
    execute $p$create policy web_read_documents on documents for select to anon, authenticated
              using (exists (select 1 from items i where i.document_id = documents.id
                             and i.review_status in ('auto', 'approved')))$p$;
  end if;
end
$$;
