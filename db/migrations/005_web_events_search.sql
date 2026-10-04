-- 005_web_events_search: what the website needs beyond web_items.
--   * web_items gets a sort time (publish time, else first seen) and the item's category group.
--   * web_events: upcoming board meetings, AGMs/EOGMs, briefings and book closures, read from
--     the verified facts of published items.
--   * web_search(): full-text search over published items, plus symbol / company name match.
-- All of these run with the caller's rights, so the website (anon) still sees only published items.

create or replace view web_items with (security_invoker = true) as
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
  ur.body       as body_ur,
  coalesce(d.published_at, d.first_seen_at) as sort_time
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

create view web_events with (security_invoker = true) as
select w.id as item_id, w.symbol, w.company_name, w.sector,
       coalesce(w.facts->>'meeting_kind', 'board') as kind,
       (w.facts->'meeting_date'->>'value')::date as event_date,
       null::date as end_date,
       w.facts->>'meeting_time' as event_time,
       w.headline_en, w.headline_ur, w.sort_time
from web_items w
where w.facts ? 'meeting_date'
union all
select w.id, w.symbol, w.company_name, w.sector,
       'book_closure',
       (w.facts->'book_closure_from'->>'value')::date,
       (w.facts->'book_closure_to'->>'value')::date,
       null,
       w.headline_en, w.headline_ur, w.sort_time
from web_items w
where w.facts ? 'book_closure_from';

create function web_search(q text, sym text default null, lim int default 30)
returns setof web_items
language sql stable security invoker as $$
  select w.*
  from web_items w
  join items i on i.id = w.id
  where (sym is null or w.symbol = upper(sym))
    and (
      i.search @@ (websearch_to_tsquery('english', q) || websearch_to_tsquery('simple', q))
      or w.symbol ilike q
      or w.company_name ilike '%' || q || '%'
    )
  order by
    (w.symbol ilike q) desc,
    ts_rank(i.search, websearch_to_tsquery('english', q) || websearch_to_tsquery('simple', q)) desc,
    w.sort_time desc
  limit least(greatest(lim, 1), 100);
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on web_items, web_events, web_companies to anon, authenticated';
    execute 'grant select (first_seen_at) on documents to anon, authenticated';
    execute 'grant select (search) on items to anon, authenticated';
    execute 'grant execute on function web_search(text, text, int) to anon, authenticated';
  end if;
end
$$;
