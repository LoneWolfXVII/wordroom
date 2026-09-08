-- Rate limiting for Edge Functions. Added by workstream 5.
--
-- Why in the database: Edge Functions run in many short-lived isolates, so an
-- in-memory counter hands an attacker a fresh budget on every cold start. One
-- atomic upsert per request is cheap and is shared across every isolate.
--
-- This table holds counters keyed by '<bucket>:<auth user id>'. It contains no
-- game state, no answers and no seeds, and like every other table here it is
-- unreachable from a browser.

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int         not null default 0,
  constraint rate_limits_hits_valid check (hits >= 0)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;

-- Supabase grants new public tables to anon and authenticated by default, so
-- this revoke is load-bearing. There is deliberately no policy: only the
-- service role, which bypasses RLS, ever touches this table.
revoke all on public.rate_limits from anon, authenticated;
grant  all on public.rate_limits to   service_role;

comment on table public.rate_limits is
  'Fixed-window request counters for Edge Functions. Service role only.';

-- ---------------------------------------------------------------------------
-- rate_limit_hit — count one request and say whether it is allowed.
--
-- Fixed window rather than sliding: a caller can burst across a window boundary
-- and briefly get up to 2x the limit. That is fine for the job (stopping a
-- runaway loop) and keeps this to a single statement with no scan.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(
  p_key            text,
  p_window_seconds int,
  p_max_hits       int
)
returns table (allowed boolean, remaining int, retry_after_seconds int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_start  timestamptz;
  v_hits   int;
begin
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case
                         when now() - rl.window_start >= v_window then now()
                         else rl.window_start
                       end,
        hits         = case
                         when now() - rl.window_start >= v_window then 1
                         else rl.hits + 1
                       end
  returning rl.window_start, rl.hits into v_start, v_hits;

  return query
    select v_hits <= greatest(p_max_hits, 1),
           greatest(greatest(p_max_hits, 1) - v_hits, 0),
           greatest(ceil(extract(epoch from (v_start + v_window - now())))::int, 0);
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public;
grant  execute on function public.rate_limit_hit(text, int, int) to service_role;

comment on function public.rate_limit_hit(text, int, int) is
  'Atomic fixed-window counter. Returns allowed/remaining/retry_after_seconds.';

-- ---------------------------------------------------------------------------
-- Housekeeping. Rows are tiny and self-healing (a stale key is reset on its
-- next hit), but a key that is never used again would linger. Call this from a
-- cron job if one is ever set up; nothing depends on it running.
-- ---------------------------------------------------------------------------
create or replace function public.prune_rate_limits(p_older_than interval default interval '7 days')
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.rate_limits
     where window_start < now() - p_older_than
    returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.prune_rate_limits(interval) from public;
grant  execute on function public.prune_rate_limits(interval) to service_role;
