-- Wait mode: a room can play in rounds instead of each player racing ahead.
--
-- A round is puzzle N of one mode (a Four game number, in mode 4). In Wait
-- mode `get_puzzle` and `get_four` refuse anything past the open round until
-- it ends. Numbers at or below it stay playable, so a player who is behind can
-- always catch up. Scoring and the leaderboard do not change.
--
-- Spec: docs/superpowers/specs/2026-10-12-wait-mode-design.md
-- ---------------------------------------------------------------------------

alter table public.rooms
  add column pace text not null default 'speedrun'
  constraint rooms_pace_valid check (pace in ('speedrun', 'wait'));

-- When a player last did anything on an attempt: the "not guessed for ten
-- minutes" rule reads it. Set on every write, so no guess path has to.
alter table public.attempts add column updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger attempts_touch_updated_at
  before update on public.attempts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Rounds, and who each one waits for. Server-side only: clients ask
-- `wait_status`, so neither table has a grant or a policy.
-- ---------------------------------------------------------------------------
create table public.room_rounds (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  mode       int  not null,
  number     int  not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  primary key (room_id, mode, number)
);

-- At most one open round per room and mode.
create unique index room_rounds_one_open on public.room_rounds (room_id, mode)
  where ended_at is null;

create table public.round_participants (
  room_id   uuid not null,
  mode      int  not null,
  number    int  not null,
  -- A player who leaves the room stops counting: their row goes with them.
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, mode, number, player_id),
  foreign key (room_id, mode, number)
    references public.room_rounds (room_id, mode, number) on delete cascade
);

alter table public.room_rounds        enable row level security;
alter table public.round_participants enable row level security;
revoke all on public.room_rounds, public.round_participants from public, anon, authenticated;
grant  all on public.room_rounds, public.round_participants to service_role;

-- ---------------------------------------------------------------------------
-- round_unfinished — participants of a round who have not finished it, with
-- when each last did anything. A Four game is finished once all four of its
-- boards are.
-- ---------------------------------------------------------------------------
create or replace function public.round_unfinished(p_room_id uuid, p_mode int, p_number int)
returns table (player_id uuid, name text, last_seen timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select rp.player_id, pl.name, greatest(rp.joined_at, max(a.updated_at))
    from public.round_participants rp
    join public.players pl on pl.id = rp.player_id
    left join public.puzzles pz
      on pz.room_id = rp.room_id and pz.mode = rp.mode
     and pz.number between case when rp.mode = 4 then 4 * (rp.number - 1) + 1 else rp.number end
                       and case when rp.mode = 4 then 4 * rp.number else rp.number end
    left join public.attempts a on a.puzzle_id = pz.id and a.player_id = rp.player_id
   where rp.room_id = p_room_id and rp.mode = p_mode and rp.number = p_number
   group by rp.player_id, pl.name, rp.joined_at, pl.created_at
  having count(a.finished_at) < case when p_mode = 4 then 4 else 1 end
   order by pl.created_at;
$$;

-- ---------------------------------------------------------------------------
-- round_try_end — end the open round if nobody is still really playing it:
-- every participant finished, or the only ones left have been idle ten minutes.
-- Evaluated whenever someone asks, so no scheduled job is needed.
-- ---------------------------------------------------------------------------
create or replace function public.round_try_end(p_room_id uuid, p_mode int)
returns void
language sql
volatile
set search_path = public, pg_temp
as $$
  update public.room_rounds r
     set ended_at = now()
   where r.room_id = p_room_id and r.mode = p_mode and r.ended_at is null
     and not exists (
       select 1 from public.round_unfinished(p_room_id, p_mode, r.number) u
        where u.last_seen > now() - interval '10 minutes');
$$;

-- ---------------------------------------------------------------------------
-- round_gate — null if this player may open puzzle N, else the error body.
--
-- Called by `get_puzzle` and `get_four` after membership and the sequence
-- check, so a request that will be refused anyway never opens a round.
-- ---------------------------------------------------------------------------
create or replace function public.round_gate(
  p_room_id   uuid,
  p_player_id uuid,
  p_mode      int,
  p_number    int
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_open int;
  v_last int;
begin
  if (select pace from public.rooms where id = p_room_id) <> 'wait' then
    return null;
  end if;

  -- One decision at a time per room and mode, so two players finishing
  -- together cannot both open the next round.
  perform pg_advisory_xact_lock(hashtextextended('round:' || p_room_id || ':' || p_mode, 0));
  perform public.round_try_end(p_room_id, p_mode);

  select number into v_open from public.room_rounds
   where room_id = p_room_id and mode = p_mode and ended_at is null;

  if v_open is null then
    select coalesce(max(number), 0) into v_last from public.room_rounds
     where room_id = p_room_id and mode = p_mode;
    -- Catching up on a round that has already ended.
    if p_number <= v_last then
      return null;
    end if;
    insert into public.room_rounds (room_id, mode, number) values (p_room_id, p_mode, p_number);
    v_open := p_number;
  end if;

  if p_number < v_open then
    return null;
  end if;

  if p_number = v_open then
    insert into public.round_participants (room_id, mode, number, player_id)
    values (p_room_id, p_mode, p_number, p_player_id)
    on conflict do nothing;
    return null;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'code', 'round_not_over',
    'message', 'The room is still on No. ' || v_open || '.',
    'details', jsonb_build_object(
      'round', v_open,
      'waitingFor', (select coalesce(jsonb_agg(u.name), '[]'::jsonb)
                       from public.round_unfinished(p_room_id, p_mode, v_open) u))));
end;
$$;

revoke all on function public.round_unfinished(uuid, int, int) from public, anon, authenticated;
revoke all on function public.round_try_end(uuid, int)          from public, anon, authenticated;
revoke all on function public.round_gate(uuid, uuid, int, int)  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- wait_status — what the waiting screen shows. Ends the round if it is over,
-- so a room of waiting players moves on without anyone tapping.
-- ---------------------------------------------------------------------------
create or replace function public.wait_status(p_room_id uuid, p_mode int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_room   public.rooms%rowtype;
  v_player uuid;
  v_open   int;
begin
  select pl.id into v_player
    from public.players pl
   where pl.room_id = p_room_id and pl.auth_user_id = auth.uid();
  if v_player is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_member', 'message', 'You are not a player in this room.'));
  end if;
  select * into v_room from public.rooms where id = p_room_id;

  if v_room.pace = 'wait' then
    perform pg_advisory_xact_lock(hashtextextended('round:' || p_room_id || ':' || p_mode, 0));
    perform public.round_try_end(p_room_id, p_mode);
    select number into v_open from public.room_rounds
     where room_id = p_room_id and mode = p_mode and ended_at is null;
  end if;

  return jsonb_build_object(
    'pace',   v_room.pace,
    'isHost', v_room.host_player_id = v_player,
    'round',  v_open,
    'waitingFor', case when v_open is null then '[]'::jsonb else
      (select coalesce(jsonb_agg(u.name), '[]'::jsonb)
         from public.round_unfinished(p_room_id, p_mode, v_open) u) end);
end;
$$;

revoke all on function public.wait_status(uuid, int) from public, anon;
grant execute on function public.wait_status(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Host only: change the pace, or end the open round for whoever is left.
-- ---------------------------------------------------------------------------
create or replace function public.set_room_pace(p_room_id uuid, p_pace text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_pace not in ('speedrun', 'wait') then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'bad_request', 'message', 'That is not a pace.'));
  end if;
  if not exists (
    select 1 from public.rooms r
      join public.players pl on pl.id = r.host_player_id and pl.auth_user_id = auth.uid()
     where r.id = p_room_id
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_host', 'message', 'Only the host can change the pace.'));
  end if;

  update public.rooms set pace = p_pace where id = p_room_id;
  -- Speedrun has no rounds: everyone waiting can go on at once.
  if p_pace = 'speedrun' then
    update public.room_rounds set ended_at = now()
     where room_id = p_room_id and ended_at is null;
  end if;
  return jsonb_build_object('pace', p_pace);
end;
$$;

create or replace function public.skip_round(p_room_id uuid, p_mode int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.rooms r
      join public.players pl on pl.id = r.host_player_id and pl.auth_user_id = auth.uid()
     where r.id = p_room_id
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_host', 'message', 'Only the host can skip.'));
  end if;

  update public.room_rounds set ended_at = now()
   where room_id = p_room_id and mode = p_mode and ended_at is null;
  return jsonb_build_object('skipped', true);
end;
$$;

revoke all on function public.set_room_pace(uuid, text) from public, anon;
revoke all on function public.skip_round(uuid, int)     from public, anon;
grant execute on function public.set_room_pace(uuid, text) to authenticated;
grant execute on function public.skip_round(uuid, int)     to authenticated;

-- ---------------------------------------------------------------------------
-- get_puzzle — unchanged except that the sequence check now comes before the
-- early return for a puzzle that exists (it could never refuse one), and the
-- round gate follows it.
-- ---------------------------------------------------------------------------
create or replace function public.get_puzzle(
  p_room_id uuid,
  p_mode    int,
  p_number  int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_room    public.rooms%rowtype;
  v_player  uuid;
  v_puzzle  public.puzzles%rowtype;
  v_reached int;
  v_count   int;
  v_index   int;
  v_answer  text;
  v_gate    jsonb;
begin
  if v_user is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'unauthorized', 'message', 'Sign in to play.'));
  end if;

  if p_mode not in (5, 6, 7) or p_number < 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'bad_request', 'message', 'That is not a puzzle.'));
  end if;

  -- Membership is the join. No row means not a member, and equally means no
  -- such room; the two are deliberately one answer.
  select r.* into v_room
    from public.rooms r
    join public.players pl on pl.room_id = r.id and pl.auth_user_id = v_user
   where r.id = p_room_id;

  if v_room.id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_member', 'message', 'You are not a player in this room.'));
  end if;

  if v_room.archived_at is not null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'room_archived', 'message', 'This room has been archived.'));
  end if;

  -- Players advance independently, so any number the room has reached is fair
  -- game - you can go back to one you skipped. What you cannot do is jump ahead
  -- and materialise puzzle 900, which would let one player mine the sequence
  -- far beyond where the room actually is.
  select coalesce(max(pz.number), 0) into v_reached
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = p_mode;

  if p_number > v_reached + 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'puzzle_out_of_sequence',
      'message', 'This room has reached No. ' || v_reached
                 || '. The next puzzle is No. ' || (v_reached + 1) || '.',
      'details', jsonb_build_object('reached', v_reached, 'next', v_reached + 1)));
  end if;

  select pl.id into v_player
    from public.players pl
   where pl.room_id = v_room.id and pl.auth_user_id = v_user;

  v_gate := public.round_gate(v_room.id, v_player, p_mode, p_number);
  if v_gate is not null then
    return v_gate;
  end if;

  select pz.* into v_puzzle
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = p_mode and pz.number = p_number;

  if v_puzzle.id is not null then
    return jsonb_build_object('puzzle', jsonb_build_object(
      'id', v_puzzle.id, 'roomId', v_puzzle.room_id,
      'mode', v_puzzle.mode, 'number', v_puzzle.number));
  end if;

  select count(*) into v_count from public.word_bank wb where wb.len = p_mode;
  if v_count = 0 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'word_bank_empty', 'message', 'No answers are available for this mode.'));
  end if;

  v_index := public.puzzle_index(v_room.seed, p_mode, p_number, v_count);

  select wb.word into v_answer
    from public.word_bank wb
   where wb.len = p_mode
   order by wb.rank, wb.word
   offset v_index limit 1;

  if v_answer is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'word_bank_empty', 'message', 'No answers are available for this mode.'));
  end if;

  -- Two requests for the same new puzzle derive the same word, so whichever
  -- lands second reads back a row identical to the one it was going to write.
  insert into public.puzzles (room_id, mode, number, answer)
  values (v_room.id, p_mode, p_number, v_answer)
  on conflict (room_id, mode, number) do nothing
  returning * into v_puzzle;

  if v_puzzle.id is null then
    select * into v_puzzle from public.puzzles
     where room_id = v_room.id and mode = p_mode and number = p_number;
  end if;

  return jsonb_build_object('puzzle', jsonb_build_object(
    'id', v_puzzle.id, 'roomId', v_puzzle.room_id,
    'mode', v_puzzle.mode, 'number', v_puzzle.number));
exception
  when others then
    -- As in `submit_guess`: a raised exception reaches PostgREST verbatim, and
    -- a constraint violation brings the failing row with it.
    raise warning 'get_puzzle failed for room %: % (%)', p_room_id, sqlerrm, sqlstate;
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'internal', 'message', 'Something went wrong. Try again.'));
end;
$$;

-- ---------------------------------------------------------------------------
-- get_four — the same two changes as `get_puzzle`.
-- ---------------------------------------------------------------------------
create or replace function public.get_four(
  p_room_id uuid,
  p_number  int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_room    public.rooms%rowtype;
  v_player  public.players%rowtype;
  v_have    int;
  v_reached int;
  v_count   int;
  v_index   int;
  v_answer  text;
  v_gate    jsonb;
  b         int;
begin
  if v_user is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'unauthorized', 'message', 'Sign in to play.'));
  end if;

  if p_number is null or p_number < 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'bad_request', 'message', 'That is not a puzzle.'));
  end if;

  select r.* into v_room
    from public.rooms r
    join public.players pl on pl.room_id = r.id and pl.auth_user_id = v_user
   where r.id = p_room_id;

  if v_room.id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_member', 'message', 'You are not a player in this room.'));
  end if;

  if v_room.archived_at is not null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'room_archived', 'message', 'This room has been archived.'));
  end if;

  select pl.* into v_player
    from public.players pl
   where pl.room_id = v_room.id and pl.auth_user_id = v_user;

  -- As in `get_puzzle`: any game the room has reached is fair, the next one
  -- may be started, and nothing further ahead can be mined.
  select (coalesce(max(pz.number), 0) + 3) / 4 into v_reached
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = 4;

  if p_number > v_reached + 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'puzzle_out_of_sequence',
      'message', 'This room has reached No. ' || v_reached
                 || '. The next puzzle is No. ' || (v_reached + 1) || '.',
      'details', jsonb_build_object('reached', v_reached, 'next', v_reached + 1)));
  end if;

  v_gate := public.round_gate(v_room.id, v_player.id, 4, p_number);
  if v_gate is not null then
    return v_gate;
  end if;

  select count(*) into v_have
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = 4
     and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number;

  if v_have < 4 then
    select count(*) into v_count from public.word_bank wb where wb.len = 5;
    if v_count = 0 then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'word_bank_empty', 'message', 'No answers are available for this mode.'));
    end if;

    for b in 1..4 loop
      v_index := public.puzzle_index(v_room.seed, 4, 4 * (p_number - 1) + b, v_count);

      select wb.word into v_answer
        from public.word_bank wb
       where wb.len = 5
       order by wb.rank, wb.word
       offset v_index limit 1;

      insert into public.puzzles (room_id, mode, number, answer)
      values (v_room.id, 4, 4 * (p_number - 1) + b, v_answer)
      on conflict (room_id, mode, number) do nothing;
    end loop;
  end if;

  return jsonb_build_object('game', public.four_game_body(v_player.id, v_room.id, p_number));
exception
  when others then
    raise warning 'get_four failed for room %: % (%)', p_room_id, sqlerrm, sqlstate;
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'internal', 'message', 'Something went wrong. Try again.'));
end;
$$;
