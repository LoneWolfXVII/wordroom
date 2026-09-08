-- Leaderboard views.
--
-- Both run as the view owner and filter on membership themselves, because the
-- underlying `puzzles` grants are deliberately too narrow for an invoker-side
-- join to work. They expose scores, never guesses and never answers.
--
-- Ordering, from the spec: points first, then average guesses, then total time.
-- Time only breaks ties - it never adds points, whether or not a timer was on.

create or replace view public.leaderboard_all
  with (security_barrier = true)
  as
  select
    pl.room_id,
    pz.mode,
    pl.id   as player_id,
    pl.name as player_name,
    count(*)::int                                            as played,
    count(*) filter (where a.solved)::int                    as solved,
    sum(public.attempt_points(a.solved, a.guess_count))::int as points,
    round(avg(a.guess_count) filter (where a.solved), 2)     as average_guesses,
    sum(a.elapsed_ms)::bigint                                as total_elapsed_ms,
    bool_or(a.hard_mode)                                     as hard_mode,
    rank() over (
      partition by pl.room_id, pz.mode
      order by
        sum(public.attempt_points(a.solved, a.guess_count)) desc,
        avg(a.guess_count) filter (where a.solved) asc nulls last,
        sum(a.elapsed_ms) asc nulls last,
        pl.created_at asc
    )::int as rank
  from public.attempts a
  join public.puzzles  pz on pz.id = a.puzzle_id
  join public.players  pl on pl.id = a.player_id
  where a.finished_at is not null
    and public.is_room_member(pl.room_id)
  group by pl.room_id, pz.mode, pl.id, pl.name, pl.created_at;

grant select on public.leaderboard_all to authenticated;

-- The week runs Monday 00:00 in the host's timezone, per the room.
create or replace view public.leaderboard_week
  with (security_barrier = true)
  as
  select
    pl.room_id,
    pz.mode,
    pl.id   as player_id,
    pl.name as player_name,
    count(*)::int                                            as played,
    count(*) filter (where a.solved)::int                    as solved,
    sum(public.attempt_points(a.solved, a.guess_count))::int as points,
    round(avg(a.guess_count) filter (where a.solved), 2)     as average_guesses,
    sum(a.elapsed_ms)::bigint                                as total_elapsed_ms,
    bool_or(a.hard_mode)                                     as hard_mode,
    rank() over (
      partition by pl.room_id, pz.mode
      order by
        sum(public.attempt_points(a.solved, a.guess_count)) desc,
        avg(a.guess_count) filter (where a.solved) asc nulls last,
        sum(a.elapsed_ms) asc nulls last,
        pl.created_at asc
    )::int as rank
  from public.attempts a
  join public.puzzles  pz on pz.id = a.puzzle_id
  join public.players  pl on pl.id = a.player_id
  join public.rooms    r  on r.id  = pl.room_id
  where a.finished_at is not null
    and a.finished_at >= (
      date_trunc('week', (now() at time zone r.timezone)) at time zone r.timezone
    )
    and public.is_room_member(pl.room_id)
  group by pl.room_id, pz.mode, pl.id, pl.name, pl.created_at;

grant select on public.leaderboard_week to authenticated;

comment on view public.leaderboard_all is
  'All-time board, one row per player per mode. Scores only - no guesses, no answers.';
comment on view public.leaderboard_week is
  'Current week, resetting Monday 00:00 in the room timezone.';
