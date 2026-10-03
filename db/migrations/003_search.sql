-- 003_search: keep items.search up to date for full-text search.
-- English text uses the 'english' config (stemming: dividends -> dividend);
-- symbol, company name and Urdu text use 'simple' (exact words).

create function refresh_item_search(p_item_id bigint) returns void
language sql as $$
  update items i set search =
      setweight(to_tsvector('simple', coalesce(i.symbol, '') || ' ' || coalesce(c.name, '')), 'A')
   || setweight(to_tsvector('english', coalesce(en.headline, '') || ' ' || coalesce(en.body, '')), 'B')
   || setweight(to_tsvector('simple', coalesce(ur.headline, '') || ' ' || coalesce(ur.body, '')), 'B')
   || setweight(to_tsvector('english', coalesce(i.category, '')), 'C')
  from items i2
  left join companies c on c.symbol = i2.symbol
  left join lateral (
    select headline, body from summaries
    where item_id = i2.id and lang = 'en' order by created_at desc, id desc limit 1
  ) en on true
  left join lateral (
    select headline, body from summaries
    where item_id = i2.id and lang = 'ur' order by created_at desc, id desc limit 1
  ) ur on true
  where i.id = p_item_id and i2.id = p_item_id;
$$;

create function trg_summaries_refresh_search() returns trigger
language plpgsql as $$
begin
  perform refresh_item_search(new.item_id);
  return new;
end;
$$;

create trigger summaries_refresh_search
after insert or update on summaries
for each row execute function trg_summaries_refresh_search();

create function trg_items_refresh_search() returns trigger
language plpgsql as $$
begin
  perform refresh_item_search(new.id);
  return new;
end;
$$;

create trigger items_refresh_search
after insert or update of symbol, category on items
for each row execute function trg_items_refresh_search();

-- Only the pipeline (table owner) should run this; Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function refresh_item_search(bigint) from public;
