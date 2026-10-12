-- Wait mode, end to end, in one rolled-back transaction.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -qtA -f supabase/tests/wait_mode.test.sql
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a1', true),
  ('00000000-0000-0000-0000-0000000000b1', true);
insert into public.rooms (id, code, name, seed) values
  ('10000000-0000-0000-0000-0000000000a1', 'WAKE', 'Wait', 'test-seed');
insert into public.players (id, room_id, auth_user_id, name, created_at) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a1', 'Ana', now() - interval '1 minute'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b1', 'Ben', now());
update public.rooms set host_player_id = '30000000-0000-0000-0000-0000000000a1'
 where id = '10000000-0000-0000-0000-0000000000a1';

-- Helpers, as the owner: play as someone, and solve a puzzle outright.
create function pg_temp.as_player(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
end $$;

create function pg_temp.get(p_number int) returns jsonb language sql as $$
  select public.get_puzzle('10000000-0000-0000-0000-0000000000a1', 5, p_number);
$$;

-- Solving needs the answer, which only the owner can read; the guess itself
-- still goes through `submit_guess` as the player.
create function pg_temp.solve(p_number int) returns void language plpgsql security definer as $$
declare v_id uuid; v_answer text;
begin
  select id, answer into v_id, v_answer from public.puzzles
   where room_id = '10000000-0000-0000-0000-0000000000a1' and mode = 5 and number = p_number;
  assert not public.submit_guess(v_id, v_answer) ? 'error', 'the solve went through';
end $$;
-- A wrong guess, to start an attempt without finishing it.
create function pg_temp.miss(p_number int) returns void language plpgsql security definer as $$
declare v_id uuid; v_word text;
begin
  select id into v_id from public.puzzles
   where room_id = '10000000-0000-0000-0000-0000000000a1' and mode = 5 and number = p_number;
  select g.word into v_word from public.guess_bank g
   where g.len = 5 and g.word <> (select answer from public.puzzles where id = v_id)
   order by g.word limit 1;
  assert not public.submit_guess(v_id, v_word) ? 'error', 'the miss went through';
end $$;
grant execute on function pg_temp.as_player(text), pg_temp.get(int), pg_temp.solve(int),
  pg_temp.miss(int) to authenticated;

set local role authenticated;

-- Only the host sets the pace.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert public.set_room_pace('10000000-0000-0000-0000-0000000000a1', 'wait')
    -> 'error' ->> 'code' = 'not_host', 'a guest cannot change the pace';
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  assert public.set_room_pace('10000000-0000-0000-0000-0000000000a1', 'wait')
    ->> 'pace' = 'wait', 'the host can';
end $$;

-- Round 1: both open it, Ana finishes, and No. 2 waits for Ben.
do $$ declare r jsonb; begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  assert pg_temp.get(1) ? 'puzzle', 'Ana opens round 1';
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert pg_temp.get(1) ? 'puzzle', 'Ben joins it';

  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.solve(1);
  r := pg_temp.get(2);
  assert r -> 'error' ->> 'code' = 'round_not_over', 'No. 2 waits';
  assert r -> 'error' -> 'details' -> 'waitingFor' = '["Ben"]', 'for Ben';

  r := public.wait_status('10000000-0000-0000-0000-0000000000a1', 5);
  assert r ->> 'round' = '1' and (r ->> 'isHost')::boolean, 'the status agrees';

  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  perform pg_temp.solve(1);
  r := public.wait_status('10000000-0000-0000-0000-0000000000a1', 5);
  assert r -> 'round' = 'null' and not (r ->> 'isHost')::boolean, 'everyone is done: it ends';

  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  assert pg_temp.get(2) ? 'puzzle', 'Ana goes on to No. 2';
end $$;

-- A player who is behind can always catch up.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert pg_temp.get(1) ? 'puzzle', 'an ended round stays playable';
end $$;

-- Round 2: Ben opened it and went quiet. Ten minutes on, it ends without him.
do $$ declare r jsonb; begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert pg_temp.get(2) ? 'puzzle', 'Ben joins round 2';
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.solve(2);
  assert pg_temp.get(3) -> 'error' ->> 'code' = 'round_not_over', 'waits while Ben is active';
end $$;
reset role;
update public.round_participants set joined_at = now() - interval '11 minutes'
 where player_id = '30000000-0000-0000-0000-0000000000b1' and number = 2;
set local role authenticated;
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  assert pg_temp.get(3) ? 'puzzle', 'an idle player is not waited for';
end $$;

-- Round 3: the host skips whoever is left; a guest cannot.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert pg_temp.get(3) ? 'puzzle', 'Ben joins round 3';
  assert public.skip_round('10000000-0000-0000-0000-0000000000a1', 5)
    -> 'error' ->> 'code' = 'not_host', 'a guest cannot skip';
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.solve(3);
  assert pg_temp.get(4) -> 'error' ->> 'code' = 'round_not_over', 'waits for Ben';
  assert not public.skip_round('10000000-0000-0000-0000-0000000000a1', 5) ? 'error', 'host skips';
  assert pg_temp.get(4) ? 'puzzle', 'and No. 4 opens';
end $$;

-- Round 4: switching to Speedrun lets everyone go on at once.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert pg_temp.get(4) ? 'puzzle', 'Ben joins round 4';
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.solve(4);
  assert pg_temp.get(5) -> 'error' ->> 'code' = 'round_not_over', 'waits for Ben';
  perform public.set_room_pace('10000000-0000-0000-0000-0000000000a1', 'speedrun');
  assert pg_temp.get(5) ? 'puzzle', 'Speedrun: no waiting';
  assert pg_temp.get(6) ? 'puzzle', 'and none after';
end $$;

-- A request that is refused for being out of sequence opens no round.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  perform public.set_room_pace('10000000-0000-0000-0000-0000000000a1', 'wait');
  assert pg_temp.get(99) -> 'error' ->> 'code' = 'puzzle_out_of_sequence', 'no jumping';
  assert (public.wait_status('10000000-0000-0000-0000-0000000000a1', 5)) -> 'round' = 'null',
    'and no round opened at 99';
end $$;

-- Switched back to Wait with players spread out (Speedrun took the room to
-- No. 6): the round opens at the front, so nobody ahead is held back.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000b1');
  assert pg_temp.get(5) ? 'puzzle', 'Ben, behind, catches up';
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.miss(6);
  assert pg_temp.get(7) ? 'puzzle', 'Ana, ahead, is not held behind Ben';
end $$;

-- A puzzle someone has started is never locked, even behind a stale round.
reset role;
update public.room_rounds set ended_at = now()
 where room_id = '10000000-0000-0000-0000-0000000000a1' and mode = 5 and ended_at is null;
insert into public.room_rounds (room_id, mode, number)
values ('10000000-0000-0000-0000-0000000000a1', 5, 5);
set local role authenticated;
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  assert pg_temp.get(6) ? 'puzzle', 'Ana gets back into the puzzle she started';
end $$;

-- The old get-puzzle Edge Function creates puzzles through materialise_puzzle,
-- which knows nothing of rounds: in a Wait room it refuses.
reset role;
do $$ begin
  assert public.materialise_puzzle('10000000-0000-0000-0000-0000000000a1', 5, 7, 0) is null,
    'no puzzle past the round through the old path';
end $$;
set local role authenticated;

-- Four at once has rounds of its own.
do $$ begin
  perform pg_temp.as_player('00000000-0000-0000-0000-0000000000a1');
  assert public.get_four('10000000-0000-0000-0000-0000000000a1', 1) ? 'game', 'Four game 1';
  assert public.get_four('10000000-0000-0000-0000-0000000000a1', 2)
    -> 'error' ->> 'code' = 'round_not_over', 'game 2 waits for game 1';
  assert (public.wait_status('10000000-0000-0000-0000-0000000000a1', 4)) ->> 'round' = '1',
    'a Four round is a game number';
end $$;

-- A player who leaves stops counting.
reset role;
delete from public.players where id = '30000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert not exists (select 1 from public.round_participants
                      where player_id = '30000000-0000-0000-0000-0000000000b1'), 'gone';
end $$;

-- No client can read the rounds directly.
set local role authenticated;
do $$ begin
  begin
    perform 1 from public.room_rounds;
    assert false, 'room_rounds must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
