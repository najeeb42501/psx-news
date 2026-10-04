-- 009: admin_health() v2 (v1.1 phase 2). Same as 007 plus:
--   sources.last_success_at (the "captured until" mark, migration 008), and
--   delays: how long items take, per source over the last 7 days, in minutes:
--     published -> stored   (first_seen_at - published_at): how quickly a run picked it up
--     stored -> summarised  (items.created_at - first_seen_at): processing time until it is on the site
-- Not callable with the public key.
create or replace function admin_health() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'documents', (select coalesce(jsonb_object_agg(status, n), '{}') from
                   (select status, count(*) n from documents group by status) s),
    'items', (select coalesce(jsonb_object_agg(review_status, n), '{}') from
               (select review_status, count(*) n from items group by review_status) s),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', id, 'kind', kind, 'enabled', enabled, 'last_run_at', last_run_at,
                   'last_success_at', last_success_at, 'last_error', last_error)
                 order by id), '[]') from sources),
    -- documents stored per source per Pakistan-time day (last 14 days), for the capture check
    'docs_by_day', (select coalesce(jsonb_agg(jsonb_build_object('source_id', source_id, 'day', day, 'n', n)), '[]') from
                     (select source_id, (published_at at time zone 'Asia/Karachi')::date as day, count(*) n
                        from documents
                       where published_at > now() - interval '14 days'
                       group by 1, 2) d),
    'delays', (select coalesce(jsonb_agg(jsonb_build_object(
                  'source_id', source_id, 'n', n,
                  'stored_median', stored_median, 'stored_p90', stored_p90,
                  'summarised_median', summarised_median, 'summarised_p90', summarised_p90)
                order by source_id), '[]') from
                (select d.source_id, count(*) n,
                        round(percentile_cont(0.5) within group (order by extract(epoch from d.first_seen_at - d.published_at) / 60)) stored_median,
                        round(percentile_cont(0.9) within group (order by extract(epoch from d.first_seen_at - d.published_at) / 60)) stored_p90,
                        round(percentile_cont(0.5) within group (order by extract(epoch from i.created_at - d.first_seen_at) / 60)) summarised_median,
                        round(percentile_cont(0.9) within group (order by extract(epoch from i.created_at - d.first_seen_at) / 60)) summarised_p90
                   from documents d join items i on i.document_id = d.id
                  where d.published_at > now() - interval '7 days' and d.first_seen_at >= d.published_at
                  group by d.source_id) x),
    -- AI use today (UTC day, which is when the free quotas reset)
    'llm_today', (select coalesce(jsonb_agg(jsonb_build_object(
                    'provider', provider, 'model', model, 'ok', ok_calls, 'failed', failed_calls,
                    'prompt_tokens', pt, 'completion_tokens', ct)), '[]') from
                   (select provider, model,
                           count(*) filter (where ok) ok_calls, count(*) filter (where not ok) failed_calls,
                           coalesce(sum(prompt_tokens), 0) pt, coalesce(sum(completion_tokens), 0) ct
                      from llm_calls where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
                     group by 1, 2) l)
  );
$$;

revoke execute on function admin_health() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function admin_health() from anon, authenticated';
    execute 'grant execute on function admin_health() to service_role';
  end if;
end
$$;
