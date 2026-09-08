-- Row Level Security and grants.
--
-- The single rule this file exists to enforce: a puzzle answer never reaches a
-- client. That is defended twice over, because RLS alone is one `create policy`
-- away from being undone.
--
--   1. GRANTS. `answer` and every column of `word_bank` are revoked from anon
--      and authenticated. A permissive policy added later still cannot read
--      them - PostgreSQL checks column privileges before it checks policies.
--   2. POLICIES. Rows are then narrowed to the caller's own rooms.
--
-- Supabase's default privileges hand new tables in `public` to anon and
-- authenticated, so every REVOKE below is load-bearing. A new table in this
-- schema is readable by the world until you say otherwise.

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so a policy can ask "is the caller in
-- this room?" without the caller needing to read the tables that answer it.
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.players p
     where p.room_id = p_room_id
       and p.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_puzzle_member(p_puzzle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.puzzles pz
      join public.players pl on pl.room_id = pz.room_id
     where pz.id = p_puzzle_id
       and pl.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.is_puzzle_member(uuid) from public;
grant execute on function public.is_room_member(uuid)   to authenticated, service_role;
grant execute on function public.is_puzzle_member(uuid) to authenticated, service_role;
grant execute on function public.attempt_points(boolean, int) to authenticated, service_role;

alter table public.rooms     enable row level security;
alter table public.players   enable row level security;
alter table public.puzzles   enable row level security;
alter table public.attempts  enable row level security;
alter table public.word_bank enable row level security;

-- ---------------------------------------------------------------------------
-- word_bank — answers. No client role has any privilege at all, and there is
-- deliberately no policy: even a future GRANT would find no row it may read.
-- ---------------------------------------------------------------------------
revoke all on public.word_bank from anon, authenticated;
grant  all on public.word_bank to   service_role;

-- ---------------------------------------------------------------------------
-- rooms — members read their own room. Creating and joining go through Edge
-- Functions with the service role, so a code cannot be brute-forced over REST.
-- ---------------------------------------------------------------------------
--
-- `seed` is left out of the grant, for the same reason `answer` is: the seed
-- derives every answer the room will ever use.
revoke all on public.rooms from anon, authenticated;
grant  select (id, code, name, host_player_id, max_players, timezone,
               created_at, archived_at)
  on public.rooms to authenticated;
grant  all on public.rooms to service_role;

create policy rooms_select_member
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

-- Seed-free projection, safe to `select *`.
create view public.room_details
  with (security_invoker = on, security_barrier = true)
  as select id, code, name, host_player_id, max_players, timezone,
            created_at, archived_at
       from public.rooms;

grant select on public.room_details to authenticated;

comment on view public.room_details is
  'Seed-free projection of rooms. Prefer this over selecting rooms directly.';

-- ---------------------------------------------------------------------------
-- players — members see each other. A player may change their own settings and
-- nothing else; the column grant limits the update, the trigger in the init
-- migration is the second lock on the name.
-- ---------------------------------------------------------------------------
revoke all              on public.players from anon, authenticated;
grant  select           on public.players to   authenticated;
grant  update (settings) on public.players to  authenticated;
grant  all              on public.players to   service_role;

create policy players_select_member
  on public.players for select
  to authenticated
  using (public.is_room_member(room_id));

create policy players_update_own
  on public.players for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- puzzles — THE important one.
--
-- `answer` is absent from this grant list. `select answer from puzzles` and
-- `select * from puzzles` both fail with "permission denied for column answer",
-- for every client, in every room, whatever the policies say.
-- ---------------------------------------------------------------------------
revoke all on public.puzzles from anon, authenticated;
grant  select (id, room_id, mode, number, created_at)
  on public.puzzles to authenticated;
grant  all on public.puzzles to service_role;

create policy puzzles_select_member
  on public.puzzles for select
  to authenticated
  using (public.is_room_member(room_id));

-- Convenience shape for clients: `select *` here is safe because the view has
-- no answer to hand out. security_invoker keeps the caller's RLS in force.
create view public.room_puzzles
  with (security_invoker = on, security_barrier = true)
  as select id, room_id, mode, number, created_at
       from public.puzzles;

grant select on public.room_puzzles to authenticated;

comment on view public.room_puzzles is
  'Answer-free projection of puzzles. Prefer this over selecting puzzles directly.';

-- ---------------------------------------------------------------------------
-- attempts — the room reads scores and colour grids; only the author reads the
-- words. Writes go through `submit-guess` with the service role, because
-- scoring a guess requires the answer.
-- ---------------------------------------------------------------------------
revoke all on public.attempts from anon, authenticated;
grant  select (id, player_id, puzzle_id, marks, solved, guess_count,
               elapsed_ms, timer_mode, hard_mode, started_at, finished_at)
  on public.attempts to authenticated;
grant  all on public.attempts to service_role;

create policy attempts_select_member
  on public.attempts for select
  to authenticated
  using (public.is_puzzle_member(puzzle_id));

-- Your own attempts, `guesses` included. Runs as owner and filters on auth.uid()
-- rather than exposing the column to the room.
create view public.my_attempts
  with (security_barrier = true)
  as select a.*
       from public.attempts a
       join public.players p on p.id = a.player_id
      where p.auth_user_id = auth.uid();

grant select on public.my_attempts to authenticated;

comment on view public.my_attempts is
  'The caller''s own attempts, including guesses. Still no answer column.';

-- ---------------------------------------------------------------------------
-- Realtime. The leaderboard subscribes to attempts; RLS above decides what each
-- subscriber actually receives.
-- ---------------------------------------------------------------------------
--
-- CAVEAT for workstream 4: a realtime payload carries whatever columns the
-- subscribing role may select. `guesses` is revoked from authenticated, so a
-- subscriber receives `marks` and scores only - but subscribe to the answer-free
-- columns explicitly rather than relying on that, and keep the Playwright
-- assertion in workstream 6 pointed at the websocket frames as well as at HTTP.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.attempts;
    alter publication supabase_realtime add table public.players;
  end if;
end
$$;
